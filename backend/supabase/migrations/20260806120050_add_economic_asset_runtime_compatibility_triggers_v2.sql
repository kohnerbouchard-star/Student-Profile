-- Economic asset runtime compatibility triggers V2.
-- Ordered, forward-only domain migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- These compatibility triggers keep the pre-cutover Crafting and effect RPCs
-- operational after the additive core commits. Legacy callers may continue to
-- provide Store provenance or an item key while canonical context is filled in.
create or replace function economy_private.assign_crafting_output_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_game_session_id uuid;
  v_item public.game_items%rowtype;
begin
  select j.game_session_id into v_game_session_id
  from public.crafting_jobs j
  where j.id = new.job_id;
  if not found then
    raise exception 'ECONOMIC_CORE_CRAFTING_OUTPUT_JOB_REQUIRED' using errcode = 'P0001';
  end if;

  if new.game_item_id is not null then
    select gi.* into v_item
    from public.game_items gi
    where gi.game_session_id = v_game_session_id
      and gi.id = new.game_item_id;
  else
    select gi.* into v_item
    from public.game_items gi
    where gi.game_session_id = v_game_session_id
      and gi.canonical_key = new.item_key
    limit 1;
  end if;

  if not found then
    raise exception 'ECONOMIC_CORE_CRAFTING_OUTPUT_ITEM_REQUIRED:%', new.item_key using errcode = 'P0001';
  end if;

  new.game_item_id := v_item.id;
  new.item_key := v_item.canonical_key;
  return new;
end
$function$;

create trigger assign_crafting_output_context_v2
before insert or update of job_id, item_key, game_item_id
on public.crafting_job_outputs
for each row execute function economy_private.assign_crafting_output_context_v2();

create or replace function economy_private.assign_equipment_instance_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_item public.game_items%rowtype;
  v_store_game_item_id uuid;
begin
  if new.inventory_account_id is null then
    new.inventory_account_id := economy_private.ensure_player_inventory_account_v2(
      new.game_session_id,
      new.player_id
    );
  end if;

  if new.store_item_id is not null then
    select si.game_item_id into v_store_game_item_id
    from public.store_items si
    where si.game_session_id = new.game_session_id
      and si.id = new.store_item_id;
    if not found then
      raise exception 'ECONOMIC_CORE_EQUIPMENT_STORE_PROVENANCE_INVALID' using errcode = 'P0001';
    end if;
  end if;

  if new.game_item_id is null then
    new.game_item_id := v_store_game_item_id;
  end if;

  select gi.* into v_item
  from public.game_items gi
  where gi.game_session_id = new.game_session_id
    and gi.id = new.game_item_id;
  if not found
    or (v_store_game_item_id is not null and v_store_game_item_id is distinct from v_item.id)
  then
    raise exception 'ECONOMIC_CORE_EQUIPMENT_ITEM_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  new.item_key := v_item.canonical_key;
  return new;
end
$function$;

create trigger assign_equipment_instance_context_v2
before insert or update of game_session_id, player_id, store_item_id, item_key,
  inventory_account_id, game_item_id
on public.equipment_instances
for each row execute function economy_private.assign_equipment_instance_context_v2();

create or replace function economy_private.assign_item_use_request_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_item public.game_items%rowtype;
  v_store_game_item_id uuid;
begin
  if new.inventory_account_id is null then
    new.inventory_account_id := economy_private.ensure_player_inventory_account_v2(
      new.game_session_id,
      new.player_id
    );
  end if;

  if new.store_item_id is not null then
    select si.game_item_id into v_store_game_item_id
    from public.store_items si
    where si.game_session_id = new.game_session_id
      and si.id = new.store_item_id;
    if not found then
      raise exception 'ECONOMIC_CORE_ITEM_USE_STORE_PROVENANCE_INVALID' using errcode = 'P0001';
    end if;
  end if;

  if new.game_item_id is null then
    new.game_item_id := v_store_game_item_id;
  end if;

  select gi.* into v_item
  from public.game_items gi
  where gi.game_session_id = new.game_session_id
    and gi.id = new.game_item_id;
  if not found
    or (v_store_game_item_id is not null and v_store_game_item_id is distinct from v_item.id)
  then
    raise exception 'ECONOMIC_CORE_ITEM_USE_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  new.item_key := v_item.canonical_key;
  return new;
end
$function$;

create trigger assign_item_use_request_context_v2
before insert or update of game_session_id, player_id, store_item_id, item_key,
  inventory_account_id, game_item_id
on public.item_use_requests
for each row execute function economy_private.assign_item_use_request_context_v2();

create or replace function economy_private.assign_business_inventory_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_canonical_key text;
  v_account_kind text;
begin
  select b.* into v_business
  from public.business_entities b
  where b.game_session_id = new.game_session_id and b.id = new.business_id;
  if not found then
    raise exception 'ECONOMIC_CORE_BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_account_kind := case new.inventory_kind
    when 'input' then 'warehouse'
    when 'work_in_progress' then 'work_in_progress'
    else 'finished_goods'
  end;

  if new.inventory_account_id is null then
    new.inventory_account_id := economy_private.ensure_business_inventory_account_v2(
      new.game_session_id,
      new.business_id,
      v_account_kind
    );
  end if;

  if new.game_item_id is null then
    v_canonical_key := 'business.' || v_business.public_key || '.' || md5(new.item_key);
    insert into public.game_items(
      game_session_id, canonical_key, source_kind, name, item_class, subtype,
      stackable, serialized, transferable, status, metadata
    ) values (
      new.game_session_id,
      v_canonical_key,
      'legacy',
      new.item_key,
      case when new.inventory_kind = 'finished_good' then 'finished_good' else 'legacy' end,
      'business_inventory',
      true,
      false,
      true,
      'active',
      jsonb_build_object('businessId', new.business_id, 'legacyItemKey', new.item_key)
    )
    on conflict (game_session_id, canonical_key) do update set
      name = excluded.name,
      version = public.game_items.version + 1,
      updated_at = now()
    returning id into new.game_item_id;
  end if;

  if new.quantity <> trunc(new.quantity) then
    raise exception 'ECONOMIC_CORE_FRACTIONAL_BUSINESS_INVENTORY_UNSUPPORTED' using errcode = 'P0001';
  end if;

  new.total_cost_basis := round(new.quantity * new.unit_cost, 4);
  return new;
end
$function$;

create trigger assign_business_inventory_context_v2
before insert or update of game_session_id, business_id, item_key, inventory_kind, quantity, unit_cost, inventory_account_id, game_item_id
on public.business_inventory
for each row execute function economy_private.assign_business_inventory_context_v2();

create or replace function economy_private.project_business_inventory_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_currency_code text;
begin
  select b.currency_code into v_currency_code
  from public.business_entities b
  where b.id = new.business_id and b.game_session_id = new.game_session_id;

  insert into public.inventory_holdings(
    game_session_id,
    player_id,
    store_item_id,
    inventory_account_id,
    game_item_id,
    quantity_owned,
    quantity_reserved,
    average_unit_cost,
    cost_currency_code
  ) values (
    new.game_session_id,
    null,
    null,
    new.inventory_account_id,
    new.game_item_id,
    new.quantity::integer,
    0,
    new.unit_cost,
    v_currency_code
  )
  on conflict (game_session_id, inventory_account_id, game_item_id)
  do update set
    quantity_owned = excluded.quantity_owned,
    quantity_reserved = least(public.inventory_holdings.quantity_reserved, excluded.quantity_owned),
    average_unit_cost = excluded.average_unit_cost,
    cost_currency_code = excluded.cost_currency_code,
    updated_at = now(),
    version = public.inventory_holdings.version + 1;

  return new;
end
$function$;

create trigger project_business_inventory_v2
after insert or update of quantity, unit_cost, inventory_account_id, game_item_id
on public.business_inventory
for each row execute function economy_private.project_business_inventory_v2();

create or replace function economy_private.assign_store_item_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_game_item public.game_items%rowtype;
  v_inventory_account_id uuid;
  v_source_key text;
begin
  if new.game_session_id is null or new.id is null then
    raise exception 'ECONOMIC_CORE_STORE_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    new.game_item_id := coalesce(new.game_item_id, old.game_item_id);
    new.inventory_account_id := coalesce(new.inventory_account_id, old.inventory_account_id);
    new.source_item_stable_id := coalesce(new.source_item_stable_id, old.source_item_stable_id);
  end if;

  if new.game_item_id is not null then
    select item_row.* into v_game_item
    from public.game_items item_row
    where item_row.game_session_id = new.game_session_id
      and item_row.id = new.game_item_id
    for share;
    if not found then
      raise exception 'ECONOMIC_CORE_STORE_GAME_ITEM_SCOPE_INVALID' using errcode = 'P0001';
    end if;

    if v_game_item.source_kind = 'store_created' then
      update public.game_items as item_row
      set name = new.name,
          description = new.description,
          status = case when new.status = 'active' then 'active' else 'disabled' end,
          metadata = coalesce(item_row.metadata, '{}'::jsonb) || jsonb_build_object(
            'legacyStoreItemId', new.id,
            'legacyStoreItemKey', new.item_key,
            'legacyStoreCategory', new.category,
            'currencyCode', new.currency_code,
            'source', 'store_items'
          ),
          version = item_row.version + 1,
          updated_at = now()
      where item_row.game_session_id = new.game_session_id
        and item_row.id = v_game_item.id
      returning item_row.* into v_game_item;
    end if;
  else
    v_source_key := case
      when coalesce(new.source_item_stable_id, '') ~ '^item[.][a-z0-9_-]+[.]v[0-9]+$'
      then regexp_replace(new.source_item_stable_id, '^item[.]([a-z0-9_-]+)[.]v[0-9]+$', '\1')
      else null
    end;

    select item_row.* into v_game_item
    from public.game_items item_row
    where item_row.game_session_id = new.game_session_id
      and item_row.canonical_key = coalesce(v_source_key, lower(btrim(new.item_key)))
    order by case item_row.source_kind when 'physical_pack' then 0 else 1 end, item_row.id
    limit 1
    for share;

    if not found then
      insert into public.game_items(
        game_session_id,
        canonical_key,
        source_kind,
        name,
        description,
        item_class,
        subtype,
        stackable,
        serialized,
        transferable,
        status,
        metadata
      ) values (
        new.game_session_id,
        'store.' || lower(btrim(new.item_key)),
        'store_created',
        new.name,
        new.description,
        'legacy',
        'store_item',
        true,
        false,
        true,
        case when new.status = 'active' then 'active' else 'disabled' end,
        jsonb_build_object(
          'legacyStoreItemId', new.id,
          'legacyStoreItemKey', new.item_key,
          'legacyStoreCategory', new.category,
          'currencyCode', new.currency_code,
          'source', 'store_items'
        )
      )
      on conflict (game_session_id, canonical_key) do update set
        name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        metadata = public.game_items.metadata || excluded.metadata,
        version = public.game_items.version + 1,
        updated_at = now()
      returning * into v_game_item;
    end if;

    new.game_item_id := v_game_item.id;
  end if;

  v_inventory_account_id := economy_private.ensure_system_inventory_account_v2(
    new.game_session_id,
    'store',
    'store',
    'store_stock',
    'store_item:' || new.id::text
  );

  if new.inventory_account_id is not null
    and new.inventory_account_id is distinct from v_inventory_account_id
  then
    raise exception 'ECONOMIC_CORE_STORE_ACCOUNT_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  new.inventory_account_id := v_inventory_account_id;
  return new;
end
$function$;

drop trigger if exists assign_store_item_context_v2 on public.store_items;
create trigger assign_store_item_context_v2
before insert or update of game_session_id, item_key, name, description, category,
  currency_code, status, game_item_id, source_item_stable_id, inventory_account_id
on public.store_items
for each row execute function economy_private.assign_store_item_context_v2();

create or replace function economy_private.provision_player_economic_party_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  perform economy_private.ensure_player_inventory_account_v2(new.game_session_id, new.id);
  return new;
end
$function$;

create trigger provision_player_economic_party_v2
after insert on public.players
for each row execute function economy_private.provision_player_economic_party_v2();

create or replace function economy_private.provision_business_economic_party_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  perform economy_private.ensure_business_inventory_account_v2(new.game_session_id, new.id, 'warehouse');
  perform economy_private.ensure_business_inventory_account_v2(new.game_session_id, new.id, 'work_in_progress');
  perform economy_private.ensure_business_inventory_account_v2(new.game_session_id, new.id, 'finished_goods');
  return new;
end
$function$;

create trigger provision_business_economic_party_v2
after insert on public.business_entities
for each row execute function economy_private.provision_business_economic_party_v2();

revoke all on all functions in schema economy_private from public, anon, authenticated;
grant execute on all functions in schema economy_private to service_role;

commit;
