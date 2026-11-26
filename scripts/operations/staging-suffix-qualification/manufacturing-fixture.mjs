// Minimal synthetic projection fixture, NOT complete manufacturing lifecycle.
const u=n=>`'00000000-0000-0000-0000-${String(n).padStart(12,'0')}'`;
export const projectionFixture=`create schema economy_private;
create table inventory_holdings(game_session_id uuid,inventory_account_id uuid,game_item_id uuid,quantity_owned integer,quantity_reserved integer,average_unit_cost numeric(16,4),cost_currency_code text);
create table business_inventory(id uuid default gen_random_uuid(),game_session_id uuid,business_id uuid,item_key text,inventory_kind text,quantity integer,unit_cost numeric(16,4),total_cost_basis numeric(20,4),game_item_id uuid,inventory_account_id uuid,version integer default 1,updated_at timestamptz);
create table inventory_accounts(id uuid,game_session_id uuid,party_id uuid,account_kind text,status text);
create table economic_parties(id uuid,game_session_id uuid,business_id uuid,party_kind text,status text);
create table business_entities(id uuid,game_session_id uuid,currency_code text);
create table game_items(id uuid,game_session_id uuid,public_key text);
insert into inventory_accounts values(${u(3)},${u(1)},${u(5)},'warehouse','active');
insert into economic_parties values(${u(5)},${u(1)},${u(2)},'business','active');
insert into business_entities values(${u(2)},${u(1)},'USD');
insert into game_items values(${u(4)},${u(1)},'itm_synthetic');
insert into inventory_holdings values(${u(1)},${u(3)},${u(4)},3,1,0.1234,'USD');`;
export const projectionAssertions=`do $$ declare before_row jsonb; after_row jsonb; begin
select to_jsonb(h) into before_row from public.inventory_holdings h;
perform economy_private.refresh_manufacturing_inventory_projection_v1(${u(1)},${u(2)},${u(3)},${u(4)});
if not exists(select from public.business_inventory where quantity=3 and unit_cost=0.1234 and total_cost_basis=0.3702 and inventory_kind='input') then raise exception 'PROJECTION_PRECISION_FAILED'; end if;
perform economy_private.refresh_manufacturing_inventory_projection_v1(${u(1)},${u(2)},${u(3)},${u(4)});
select to_jsonb(h) into after_row from public.inventory_holdings h;
if before_row is distinct from after_row or (select count(*) from public.business_inventory)<>1 then raise exception 'CANONICAL_HOLDING_CHANGED'; end if;
begin perform economy_private.refresh_manufacturing_inventory_projection_v1(${u(1)},${u(9)},${u(3)},${u(4)});raise exception 'WRONG_SCOPE_ACCEPTED';exception when raise_exception then if sqlerrm <> 'BUSINESS_MANUFACTURING_PROJECTION_SCOPE_INVALID' then raise; end if;end;
end $$;`;
