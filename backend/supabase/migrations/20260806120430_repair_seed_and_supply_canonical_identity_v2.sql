-- Preserve canonical item identity across Seed-first Store sync and physical-pack import V2.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.promote_store_game_item_key_v2(
  p_game_session_id uuid,
  p_store_item_id uuid,
  p_canonical_key text,
  p_source_item_stable_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_store_item public.store_items%rowtype;
  v_current_item public.game_items%rowtype;
  v_target_item public.game_items%rowtype;
  v_key text := lower(btrim(coalesce(p_canonical_key, '')));
  v_source_stable_id text := nullif(btrim(coalesce(p_source_item_stable_id, '')), '');
begin
  if p_game_session_id is null
    or p_store_item_id is null
    or v_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  then
    raise exception 'ECONOMIC_CORE_CANONICAL_ITEM_KEY_INVALID:%', coalesce(p_canonical_key, '')
      using errcode = '22023';
  end if;

  select si.* into v_store_item
  from public.store_items si
  where si.game_session_id = p_game_session_id
    and si.id = p_store_item_id
  for update;
  if not found or v_store_item.game_item_id is null then
    raise exception 'ECONOMIC_CORE_STORE_GAME_ITEM_REQUIRED:%', p_store_item_id
      using errcode = 'P0001';
  end if;

  select gi.* into v_current_item
  from public.game_items gi
  where gi.game_session_id = p_game_session_id
    and gi.id = v_store_item.game_item_id
  for update;
  if not found then
    raise exception 'ECONOMIC_CORE_STORE_GAME_ITEM_SCOPE_INVALID:%', p_store_item_id
      using errcode = 'P0001';
  end if;

  if v_current_item.canonical_key = v_key then
    if v_source_stable_id is not null
      and v_store_item.source_item_stable_id is distinct from v_source_stable_id
    then
      update public.store_items
      set source_item_stable_id = v_source_stable_id
      where game_session_id = p_game_session_id
        and id = p_store_item_id;
    end if;
    return v_current_item.id;
  end if;

  select gi.* into v_target_item
  from public.game_items gi
  where gi.game_session_id = p_game_session_id
    and gi.canonical_key = v_key
  limit 1
  for update;

  if found and v_target_item.id is distinct from v_current_item.id then
    if exists (
      select 1
      from public.inventory_holdings h
      where h.game_session_id = p_game_session_id
        and h.game_item_id = v_current_item.id
        and h.inventory_account_id <> v_store_item.inventory_account_id
        and (h.quantity_owned > 0 or h.quantity_reserved > 0)
    ) then
      raise exception 'ECONOMIC_CORE_STORE_MAPPING_HAS_OWNERSHIP:%', v_store_item.item_key
        using errcode = 'P0001',
        hint = 'Use the explicit historical ownership migration instead of remapping an active Store offer.';
    end if;

    if exists (
      select 1
      from public.inventory_transaction_lines l
      where l.game_session_id = p_game_session_id
        and l.game_item_id = v_current_item.id
    ) then
      raise exception 'ECONOMIC_CORE_STORE_MAPPING_HAS_JOURNAL_HISTORY:%', v_store_item.item_key
        using errcode = 'P0001';
    end if;

    update public.store_items
    set
      game_item_id = v_target_item.id,
      source_item_stable_id = coalesce(v_source_stable_id, source_item_stable_id)
    where game_session_id = p_game_session_id
      and id = p_store_item_id;

    delete from public.inventory_holdings h
    where h.game_session_id = p_game_session_id
      and h.inventory_account_id = v_store_item.inventory_account_id
      and h.game_item_id = v_current_item.id
      and h.quantity_reserved = 0;

    delete from public.game_items gi
    where gi.game_session_id = p_game_session_id
      and gi.id = v_current_item.id
      and gi.source_kind = 'store_created'
      and not exists (select 1 from public.store_items si where si.game_item_id = gi.id)
      and not exists (select 1 from public.inventory_holdings h where h.game_item_id = gi.id);

    return v_target_item.id;
  end if;

  update public.game_items gi
  set
    canonical_key = v_key,
    metadata = coalesce(gi.metadata, '{}'::jsonb)
      || jsonb_build_object('canonicalIdentityPendingPhysicalPack', gi.physical_item_definition_id is null)
      || case when v_source_stable_id is null then '{}'::jsonb else jsonb_build_object('sourceItemStableId', v_source_stable_id) end,
    version = gi.version + 1,
    updated_at = now()
  where gi.game_session_id = p_game_session_id
    and gi.id = v_current_item.id
  returning gi.* into v_current_item;

  if v_source_stable_id is not null
    and v_store_item.source_item_stable_id is distinct from v_source_stable_id
  then
    update public.store_items
    set source_item_stable_id = v_source_stable_id
    where game_session_id = p_game_session_id
      and id = p_store_item_id;
  end if;

  return v_current_item.id;
end
$function$;

create or replace function economy_private.sync_associated_physical_items_v2(
  p_game_session_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_synced integer := 0;
begin
  if not exists (select 1 from public.game_sessions g where g.id = p_game_session_id) then
    raise exception 'ECONOMIC_CORE_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.game_session_physical_economy_packs gp
    join public.physical_economy_item_definitions d on d.pack_id = gp.pack_id
    where gp.game_session_id = p_game_session_id
      and gp.status in ('staged','active','disabled')
    group by d.item_key
    having count(distinct d.id) > 1
  ) then
    raise exception 'ECONOMIC_CORE_DUPLICATE_GAME_ITEM_SOURCE' using errcode = 'P0001';
  end if;

  insert into public.game_items(
    game_session_id, canonical_key, source_kind, physical_item_definition_id,
    name, description, item_class, subtype, stackable, serialized,
    transferable, status, metadata
  )
  select
    gp.game_session_id, d.item_key, 'physical_pack', d.id,
    d.name, d.description, d.item_class, d.subtype, d.stackable,
    d.item_class = 'equipment', coalesce((d.metadata->>'transferable')::boolean, true),
    case when gp.status = 'active' and d.status = 'active' then 'active' else 'disabled' end,
    jsonb_build_object(
      'packId', d.pack_id,
      'currencyCode', d.currency_code,
      'effectEnabled', d.effect_enabled,
      'effectCode', d.effect_code,
      'source', 'physical_economy_item_definitions'
    )
  from public.game_session_physical_economy_packs gp
  join public.physical_economy_item_definitions d on d.pack_id = gp.pack_id
  where gp.game_session_id = p_game_session_id
    and gp.status in ('staged','active','disabled')
  on conflict (game_session_id, canonical_key) do update set
    source_kind = 'physical_pack',
    physical_item_definition_id = excluded.physical_item_definition_id,
    name = excluded.name,
    description = excluded.description,
    item_class = excluded.item_class,
    subtype = excluded.subtype,
    stackable = excluded.stackable,
    serialized = excluded.serialized,
    transferable = excluded.transferable,
    status = excluded.status,
    metadata = (public.game_items.metadata - 'canonicalIdentityPendingPhysicalPack') || excluded.metadata,
    version = public.game_items.version + 1,
    updated_at = now();

  get diagnostics v_synced = row_count;
  return v_synced;
end
$function$;

create or replace function economy_private.assign_item_supply_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_store_item public.store_items%rowtype;
begin
  new.item_key := lower(btrim(new.item_key));

  if new.game_item_id is not null and not exists (
    select 1 from public.game_items gi
    where gi.game_session_id = new.game_session_id
      and gi.id = new.game_item_id
  ) then
    raise exception 'ECONOMIC_CORE_SUPPLY_ITEM_SCOPE_INVALID:%', new.item_key using errcode = 'P0001';
  end if;

  if new.game_item_id is null then
    select gi.id into new.game_item_id
    from public.game_items gi
    where gi.game_session_id = new.game_session_id
      and gi.canonical_key = new.item_key
    limit 1;
  end if;

  if new.game_item_id is null then
    select si.* into v_store_item
    from public.store_items si
    where si.game_session_id = new.game_session_id
      and si.item_key = new.item_key
    order by si.id
    limit 1;

    if found then
      new.game_item_id := economy_private.promote_store_game_item_key_v2(
        new.game_session_id, v_store_item.id, new.item_key, v_store_item.source_item_stable_id
      );
    end if;
  end if;

  if new.game_item_id is null then
    raise exception 'ECONOMIC_CORE_SUPPLY_ITEM_REQUIRED:%', new.item_key using errcode = 'P0001';
  end if;

  return new;
end
$function$;

create or replace function public.sync_game_item_catalog_v2(
  p_game_session_id uuid,
  p_store_items jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_entry jsonb;
  v_store_item public.store_items%rowtype;
  v_definition public.physical_economy_item_definitions%rowtype;
  v_game_item public.game_items%rowtype;
  v_source_stable_id text;
  v_source_key text;
  v_mapped integer := 0;
  v_created integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and session_user not in ('postgres','supabase_admin') then
    raise exception 'ECONOMIC_CORE_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if not exists (select 1 from public.game_sessions g where g.id = p_game_session_id) then
    raise exception 'ECONOMIC_CORE_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_store_items is not null then
    if jsonb_typeof(p_store_items) <> 'array' then
      raise exception 'ECONOMIC_CORE_STORE_PAYLOAD_ARRAY_REQUIRED' using errcode = '22023';
    end if;

    for v_entry in select value from jsonb_array_elements(p_store_items)
    loop
      v_source_stable_id := btrim(coalesce(v_entry->>'sourceItemStableId', ''));
      if v_source_stable_id !~ '^item[.][a-z0-9_-]+[.]v[0-9]+$' then
        raise exception 'ECONOMIC_CORE_SOURCE_ITEM_UNRESOLVED:%', v_source_stable_id using errcode = 'P0001';
      end if;
      v_source_key := regexp_replace(v_source_stable_id, '^item[.]([a-z0-9_-]+)[.]v[0-9]+$', '\1');

      select si.* into v_store_item
      from public.store_items si
      where si.game_session_id = p_game_session_id
        and si.item_key = lower(btrim(v_entry->>'itemKey'))
      for update;
      if not found then
        raise exception 'ECONOMIC_CORE_STORE_ITEM_NOT_FOUND:%', coalesce(v_entry->>'itemKey','') using errcode = 'P0001';
      end if;

      perform economy_private.promote_store_game_item_key_v2(
        p_game_session_id, v_store_item.id, v_source_key, v_source_stable_id
      );
      v_mapped := v_mapped + 1;
    end loop;
  end if;

  perform economy_private.sync_associated_physical_items_v2(p_game_session_id);

  if p_store_items is not null then
    for v_entry in select value from jsonb_array_elements(p_store_items)
    loop
      v_source_stable_id := btrim(coalesce(v_entry->>'sourceItemStableId', ''));
      v_source_key := regexp_replace(v_source_stable_id, '^item[.]([a-z0-9_-]+)[.]v[0-9]+$', '\1');

      select si.* into v_store_item
      from public.store_items si
      where si.game_session_id = p_game_session_id
        and si.item_key = lower(btrim(v_entry->>'itemKey'));

      select d.* into v_definition
      from public.physical_economy_item_definitions d
      join public.game_session_physical_economy_packs gp on gp.pack_id = d.pack_id
      where gp.game_session_id = p_game_session_id
        and gp.status in ('staged','active','disabled')
        and d.item_key = v_source_key
      order by case gp.status when 'active' then 0 when 'staged' then 1 else 2 end
      limit 1;

      if found then
        select gi.* into v_game_item
        from public.game_items gi
        where gi.game_session_id = p_game_session_id
          and gi.canonical_key = v_source_key
          and gi.physical_item_definition_id = v_definition.id;
        if not found then
          raise exception 'ECONOMIC_CORE_GAME_ITEM_UNRESOLVED:%', v_source_key using errcode = 'P0001';
        end if;
        if v_store_item.game_item_id is distinct from v_game_item.id then
          raise exception 'ECONOMIC_CORE_STORE_MAPPING_DIVERGED:%', v_store_item.item_key using errcode = 'P0001';
        end if;
      elsif exists (
        select 1 from public.game_session_physical_economy_packs gp
        where gp.game_session_id = p_game_session_id
          and gp.status in ('staged','active','disabled')
      ) then
        raise exception 'ECONOMIC_CORE_SOURCE_ITEM_UNRESOLVED:%', v_source_stable_id using errcode = 'P0001';
      end if;
    end loop;
  end if;

  select count(*)::integer into v_created
  from public.game_items gi
  where gi.game_session_id = p_game_session_id;

  if exists (
    select 1 from public.store_items si
    left join public.game_items gi
      on gi.game_session_id = si.game_session_id and gi.id = si.game_item_id
    where si.game_session_id = p_game_session_id and gi.id is null
  ) then
    raise exception 'ECONOMIC_CORE_STORE_MAPPING_INCOMPLETE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.physical_economy_recipe_inputs i
    join public.physical_economy_recipe_definitions r on r.id = i.recipe_id
    join public.game_session_physical_economy_packs gp on gp.pack_id = r.pack_id
    left join public.game_items gi
      on gi.game_session_id = gp.game_session_id and gi.canonical_key = i.item_key
    where gp.game_session_id = p_game_session_id
      and gp.status = 'active'
      and gi.id is null
  ) or exists (
    select 1
    from public.physical_economy_recipe_outputs o
    join public.physical_economy_recipe_definitions r on r.id = o.recipe_id
    join public.game_session_physical_economy_packs gp on gp.pack_id = r.pack_id
    left join public.game_items gi
      on gi.game_session_id = gp.game_session_id and gi.canonical_key = o.item_key
    where gp.game_session_id = p_game_session_id
      and gp.status = 'active'
      and gi.id is null
  ) then
    raise exception 'ECONOMIC_CORE_RECIPE_MAPPING_INCOMPLETE' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'gameSessionId', p_game_session_id,
    'gameItems', v_created,
    'storeMappingsApplied', v_mapped,
    'valid', true
  );
end
$function$;

create or replace function economy_private.sync_physical_pack_catalog_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  perform economy_private.sync_associated_physical_items_v2(new.game_session_id);
  return new;
end
$function$;

drop trigger if exists sync_physical_pack_catalog_context_v2 on public.game_session_physical_economy_packs;
create trigger sync_physical_pack_catalog_context_v2
after insert or update of game_session_id, pack_id, status
on public.game_session_physical_economy_packs
for each row execute function economy_private.sync_physical_pack_catalog_context_v2();

create or replace function economy_private.sync_physical_definition_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  insert into public.game_items(
    game_session_id, canonical_key, source_kind, physical_item_definition_id,
    name, description, item_class, subtype, stackable, serialized,
    transferable, status, metadata
  )
  select
    gp.game_session_id, new.item_key, 'physical_pack', new.id,
    new.name, new.description, new.item_class, new.subtype, new.stackable,
    new.item_class = 'equipment', coalesce((new.metadata->>'transferable')::boolean, true),
    case when gp.status = 'active' and new.status = 'active' then 'active' else 'disabled' end,
    jsonb_build_object(
      'packId', new.pack_id,
      'currencyCode', new.currency_code,
      'effectEnabled', new.effect_enabled,
      'effectCode', new.effect_code,
      'source', 'physical_economy_item_definitions'
    )
  from public.game_session_physical_economy_packs gp
  where gp.pack_id = new.pack_id
    and gp.status in ('staged','active','disabled')
  on conflict (game_session_id, canonical_key) do update set
    source_kind = 'physical_pack',
    physical_item_definition_id = excluded.physical_item_definition_id,
    name = excluded.name,
    description = excluded.description,
    item_class = excluded.item_class,
    subtype = excluded.subtype,
    stackable = excluded.stackable,
    serialized = excluded.serialized,
    transferable = excluded.transferable,
    status = excluded.status,
    metadata = (public.game_items.metadata - 'canonicalIdentityPendingPhysicalPack') || excluded.metadata,
    version = public.game_items.version + 1,
    updated_at = now();
  return new;
end
$function$;

drop trigger if exists sync_physical_definition_context_v2 on public.physical_economy_item_definitions;
create trigger sync_physical_definition_context_v2
after insert or update of item_key, name, description, item_class, subtype,
  stackable, currency_code, effect_code, effect_enabled, metadata, status
on public.physical_economy_item_definitions
for each row execute function economy_private.sync_physical_definition_context_v2();

do $repair$
declare
  v_store record;
  v_game record;
  v_key text;
begin
  for v_store in
    select si.game_session_id, si.id, si.item_key, si.source_item_stable_id
    from public.store_items si
    where si.game_item_id is not null
      and (
        coalesce(si.source_item_stable_id, '') ~ '^item[.][a-z0-9_-]+[.]v[0-9]+$'
        or exists (
          select 1
          from public.game_session_physical_economy_packs gp
          join public.physical_economy_item_definitions d on d.pack_id = gp.pack_id
          where gp.game_session_id = si.game_session_id
            and gp.status in ('staged','active','disabled')
            and d.item_key = si.item_key
        )
      )
    order by si.game_session_id, si.id
  loop
    v_key := case
      when coalesce(v_store.source_item_stable_id, '') ~ '^item[.][a-z0-9_-]+[.]v[0-9]+$'
      then regexp_replace(v_store.source_item_stable_id, '^item[.]([a-z0-9_-]+)[.]v[0-9]+$', '\1')
      else lower(btrim(v_store.item_key))
    end;

    perform economy_private.promote_store_game_item_key_v2(
      v_store.game_session_id, v_store.id, v_key, v_store.source_item_stable_id
    );
  end loop;

  for v_game in
    select distinct gp.game_session_id
    from public.game_session_physical_economy_packs gp
    where gp.status in ('staged','active','disabled')
    order by gp.game_session_id
  loop
    perform economy_private.sync_associated_physical_items_v2(v_game.game_session_id);
  end loop;
end
$repair$;

revoke all on function economy_private.promote_store_game_item_key_v2(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function economy_private.sync_associated_physical_items_v2(uuid) from public, anon, authenticated;
revoke all on function economy_private.assign_item_supply_context_v2() from public, anon, authenticated;
revoke all on function economy_private.sync_physical_pack_catalog_context_v2() from public, anon, authenticated;
revoke all on function economy_private.sync_physical_definition_context_v2() from public, anon, authenticated;
grant execute on function economy_private.promote_store_game_item_key_v2(uuid, uuid, text, text) to service_role;
grant execute on function economy_private.sync_associated_physical_items_v2(uuid) to service_role;
grant execute on function economy_private.assign_item_supply_context_v2() to service_role;
grant execute on function economy_private.sync_physical_pack_catalog_context_v2() to service_role;
grant execute on function economy_private.sync_physical_definition_context_v2() to service_role;

revoke all on function public.sync_game_item_catalog_v2(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_game_item_catalog_v2(uuid, jsonb) to service_role;

comment on function public.sync_game_item_catalog_v2(uuid, jsonb) is
  'Synchronizes Seed Store sourceItemStableId mappings before physical-pack association and preserves one canonical game-item UUID as the physical pack is imported and activated.';

commit;
