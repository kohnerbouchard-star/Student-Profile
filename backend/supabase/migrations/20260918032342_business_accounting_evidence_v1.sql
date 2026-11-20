-- Phase 14A: retain canonical position history without a second balance authority.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.business_accounting_coverage (
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  observed_from timestamptz not null default clock_timestamp(),
  from_inception boolean not null,
  primary key (game_session_id, business_id),
  foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade
);

create table public.business_accounting_position_events (
  sequence_id bigint generated always as identity primary key,
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  source_id uuid not null,
  account_code text not null check (account_code in (
    'inventory', 'equipment', 'loan_principal', 'interest_payable'
  )),
  currency_code text not null check (currency_code ~ '^[A-Z0-9_]{3,16}$'),
  amount numeric(38,18) not null check (amount >= 0),
  cost_known boolean not null default true,
  observed_at timestamptz not null default clock_timestamp(),
  foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade
);
create index business_accounting_position_history_idx
  on public.business_accounting_position_events
  (game_session_id, business_id, source_id, account_code, currency_code, observed_at desc, sequence_id desc);
create index business_accounting_position_cutoff_idx
  on public.business_accounting_position_events(game_session_id, business_id, observed_at);

create table public.business_financial_statements (
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  close_receipt_id uuid not null,
  period_number bigint not null check (period_number > 0),
  statement_version integer not null default 1 check (statement_version = 1),
  status text not null check (status in ('complete', 'incomplete_history', 'unreconciled')),
  statement jsonb not null check (jsonb_typeof(statement) = 'object'),
  captured_at timestamptz not null default clock_timestamp(),
  primary key (game_session_id, business_id, period_number),
  unique (close_receipt_id),
  foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  foreign key (game_session_id, close_receipt_id)
    references public.business_operating_period_close_receipts(game_session_id, id) on delete cascade
);

alter table public.business_accounting_coverage enable row level security;
alter table public.business_accounting_coverage force row level security;
alter table public.business_accounting_position_events enable row level security;
alter table public.business_accounting_position_events force row level security;
alter table public.business_financial_statements enable row level security;
alter table public.business_financial_statements force row level security;
revoke all on public.business_accounting_coverage,
  public.business_accounting_position_events, public.business_financial_statements
  from public, anon, authenticated, service_role;
grant select on public.business_accounting_coverage,
  public.business_accounting_position_events, public.business_financial_statements
  to service_role;

-- Reuse the existing immutable-evidence guard, including canonical game purge.
create trigger guard_business_accounting_coverage
before update or delete on public.business_accounting_coverage
for each row execute function private.guard_business_period_evidence_v1();
create trigger guard_business_accounting_positions
before update or delete on public.business_accounting_position_events
for each row execute function private.guard_business_period_evidence_v1();
create trigger guard_business_financial_statements
before update or delete on public.business_financial_statements
for each row execute function private.guard_business_period_evidence_v1();

create function economy_private.capture_business_accounting_inception_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
begin
  insert into public.business_accounting_coverage(game_session_id,business_id,from_inception)
  values (new.game_session_id,new.id,true);
  return new;
end;
$function$;
revoke all on function economy_private.capture_business_accounting_inception_v1()
  from public,anon,authenticated,service_role;
create trigger capture_business_accounting_inception
after insert on public.business_entities
for each row execute function economy_private.capture_business_accounting_inception_v1();

create function economy_private.record_business_inventory_position_v1(
  p_row jsonb, p_zero boolean, p_at timestamptz
) returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_scope record;
  v_quantity numeric := (p_row->>'quantity_owned')::numeric;
begin
  select p.business_id, b.currency_code, i.item_class
  into v_scope
  from public.inventory_accounts a
  join public.economic_parties p on p.game_session_id=a.game_session_id and p.id=a.party_id
  join public.business_entities b on b.game_session_id=p.game_session_id and b.id=p.business_id
  join public.game_items i on i.game_session_id=a.game_session_id and i.id=(p_row->>'game_item_id')::uuid
  where a.game_session_id=(p_row->>'game_session_id')::uuid
    and a.id=(p_row->>'inventory_account_id')::uuid and p.party_kind='business';
  if not found then return; end if;
  insert into public.business_accounting_position_events(
    game_session_id,business_id,source_id,account_code,currency_code,amount,cost_known,observed_at
  ) values (
    (p_row->>'game_session_id')::uuid,v_scope.business_id,(p_row->>'id')::uuid,
    case when v_scope.item_class='equipment' then 'equipment' else 'inventory' end,
    coalesce(p_row->>'cost_currency_code',v_scope.currency_code),
    case when p_zero then 0 else v_quantity*(p_row->>'average_unit_cost')::numeric end,
    p_zero or v_quantity=0 or (p_row->>'cost_currency_code' is not null),p_at
  );
end;
$function$;
revoke all on function economy_private.record_business_inventory_position_v1(jsonb,boolean,timestamptz)
  from public,anon,authenticated,service_role;

create function economy_private.capture_business_inventory_position_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
declare v_at timestamptz := clock_timestamp();
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.game_sessions where id=old.game_session_id) then
      perform economy_private.record_business_inventory_position_v1(to_jsonb(old),true,v_at);
    end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if (old.quantity_owned,old.average_unit_cost,old.cost_currency_code,old.inventory_account_id,old.game_item_id)
      is not distinct from
      (new.quantity_owned,new.average_unit_cost,new.cost_currency_code,new.inventory_account_id,new.game_item_id)
    then return new; end if;
    if (old.cost_currency_code,old.inventory_account_id,old.game_item_id)
      is distinct from (new.cost_currency_code,new.inventory_account_id,new.game_item_id)
    then perform economy_private.record_business_inventory_position_v1(to_jsonb(old),true,v_at); end if;
  end if;
  perform economy_private.record_business_inventory_position_v1(to_jsonb(new),false,v_at);
  return new;
end;
$function$;
revoke all on function economy_private.capture_business_inventory_position_v1()
  from public,anon,authenticated,service_role;
create trigger capture_business_inventory_position
after insert or update or delete on public.inventory_holdings
for each row execute function economy_private.capture_business_inventory_position_v1();

create function economy_private.record_business_loan_position_v1(
  p_row jsonb,p_zero boolean,p_at timestamptz
) returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
begin
  if p_row->>'business_id' is null then return; end if;
  insert into public.business_accounting_position_events(
    game_session_id,business_id,source_id,account_code,currency_code,amount,observed_at
  )
  select (p_row->>'game_session_id')::uuid,(p_row->>'business_id')::uuid,
    (p_row->>'id')::uuid,s.account_code,p_row->>'currency_code',
    case when p_zero then 0 else s.amount end,p_at
  from (values
    ('loan_principal',(p_row->>'principal_balance')::numeric),
    ('interest_payable',(p_row->>'accrued_interest')::numeric)
  ) s(account_code,amount);
end;
$function$;
revoke all on function economy_private.record_business_loan_position_v1(jsonb,boolean,timestamptz)
  from public,anon,authenticated,service_role;

create function economy_private.capture_business_loan_position_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
declare v_at timestamptz := clock_timestamp();
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.game_sessions where id=old.game_session_id) then
      perform economy_private.record_business_loan_position_v1(to_jsonb(old),true,v_at);
    end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if (old.business_id,old.currency_code,old.principal_balance,old.accrued_interest)
      is not distinct from (new.business_id,new.currency_code,new.principal_balance,new.accrued_interest)
    then return new; end if;
    if (old.business_id,old.currency_code) is distinct from (new.business_id,new.currency_code) then
      perform economy_private.record_business_loan_position_v1(to_jsonb(old),true,v_at);
    end if;
  end if;
  perform economy_private.record_business_loan_position_v1(to_jsonb(new),false,v_at);
  return new;
end;
$function$;
revoke all on function economy_private.capture_business_loan_position_v1()
  from public,anon,authenticated,service_role;
create trigger capture_business_loan_position
after insert or update or delete on public.player_loans
for each row execute function economy_private.capture_business_loan_position_v1();

-- A migration-time opening observation is not fabricated pre-migration history.
insert into public.business_accounting_coverage(game_session_id,business_id,from_inception)
select game_session_id,id,false from public.business_entities;
do $baseline$
declare v_row record; v_at timestamptz := clock_timestamp();
begin
  for v_row in select h.* from public.inventory_holdings h
    join public.inventory_accounts a on a.game_session_id=h.game_session_id and a.id=h.inventory_account_id
    join public.economic_parties p on p.game_session_id=a.game_session_id and p.id=a.party_id
    where p.party_kind='business'
  loop
    perform economy_private.record_business_inventory_position_v1(to_jsonb(v_row),false,v_at);
  end loop;
  for v_row in select * from public.player_loans where business_id is not null loop
    perform economy_private.record_business_loan_position_v1(to_jsonb(v_row),false,v_at);
  end loop;
end;
$baseline$;

insert into private.game_data_purge_table_registry(table_schema,table_name) values
  ('public','business_accounting_coverage'),
  ('public','business_accounting_position_events'),
  ('public','business_financial_statements')
on conflict (table_schema,table_name) do nothing;
commit;
