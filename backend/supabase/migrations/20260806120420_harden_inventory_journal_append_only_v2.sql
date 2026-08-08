-- Append-only inventory journal insertion and commit hardening V2.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.guard_inventory_transaction_insert_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if new.status <> 'pending' or new.committed_at is not null then
    raise exception 'INVENTORY_TRANSACTION_MUST_START_PENDING' using errcode = '42501';
  end if;
  return new;
end
$function$;

create or replace function economy_private.guard_inventory_transaction_line_insert_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_status text;
begin
  select t.status into v_status
  from public.inventory_transactions t
  where t.game_session_id = new.game_session_id
    and t.id = new.transaction_id
  for share;

  if not found then
    raise exception 'INVENTORY_TRANSACTION_LINE_PARENT_MISSING' using errcode = 'P0001';
  end if;
  if v_status <> 'pending' then
    raise exception 'INVENTORY_TRANSACTION_LINE_PARENT_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end
$function$;

create or replace function economy_private.guard_inventory_transaction_mutation_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'INVENTORY_TRANSACTION_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  if old.status <> 'pending'
    or new.status not in ('committed', 'reversed')
    or new.id is distinct from old.id
    or new.public_key is distinct from old.public_key
    or new.game_session_id is distinct from old.game_session_id
    or new.transaction_type is distinct from old.transaction_type
    or new.source_domain is distinct from old.source_domain
    or new.source_action is distinct from old.source_action
    or new.source_id is distinct from old.source_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.request_hash is distinct from old.request_hash
    or new.metadata is distinct from old.metadata
    or new.created_at is distinct from old.created_at
  then
    raise exception 'INVENTORY_TRANSACTION_IMMUTABLE' using errcode = '42501';
  end if;

  if new.status = 'committed' then
    if new.committed_at is null then
      raise exception 'INVENTORY_TRANSACTION_COMMITTED_AT_REQUIRED' using errcode = 'P0001';
    end if;
    if not exists (
      select 1
      from public.inventory_transaction_lines l
      where l.game_session_id = new.game_session_id
        and l.transaction_id = new.id
    ) then
      raise exception 'INVENTORY_TRANSACTION_LINE_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

  return new;
end
$function$;

create trigger guard_inventory_transaction_insert_v2
before insert on public.inventory_transactions
for each row execute function economy_private.guard_inventory_transaction_insert_v2();

create trigger guard_inventory_transaction_line_insert_v2
before insert on public.inventory_transaction_lines
for each row execute function economy_private.guard_inventory_transaction_line_insert_v2();

revoke all on function economy_private.guard_inventory_transaction_insert_v2()
  from public, anon, authenticated;
revoke all on function economy_private.guard_inventory_transaction_line_insert_v2()
  from public, anon, authenticated;
grant execute on function economy_private.guard_inventory_transaction_insert_v2()
  to service_role;
grant execute on function economy_private.guard_inventory_transaction_line_insert_v2()
  to service_role;

commit;
