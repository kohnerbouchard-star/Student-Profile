-- Economic asset synchronization and invariant gate V2.
-- Ordered, forward-only domain migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Service-role-only synchronization and invariant gate.
-- ---------------------------------------------------------------------------

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
  v_old_game_item_id uuid;
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
    physical_item_definition_id = excluded.physical_item_definition_id,
    name = excluded.name,
    description = excluded.description,
    item_class = excluded.item_class,
    subtype = excluded.subtype,
    stackable = excluded.stackable,
    serialized = excluded.serialized,
    transferable = excluded.transferable,
    status = excluded.status,
    metadata = public.game_items.metadata || excluded.metadata,
    version = public.game_items.version + 1,
    updated_at = now();

  if p_store_items is not null then
    if jsonb_typeof(p_store_items) <> 'array' then
      raise exception 'ECONOMIC_CORE_STORE_PAYLOAD_ARRAY_REQUIRED' using errcode = '22023';
    end if;

    for v_entry in select value from jsonb_array_elements(p_store_items)
    loop
      select si.* into v_store_item
      from public.store_items si
      where si.game_session_id = p_game_session_id
        and si.item_key = lower(btrim(v_entry->>'itemKey'))
      for update;
      if not found then
        raise exception 'ECONOMIC_CORE_STORE_ITEM_NOT_FOUND:%', coalesce(v_entry->>'itemKey','') using errcode = 'P0001';
      end if;

      select d.* into v_definition
      from public.physical_economy_item_definitions d
      join public.game_session_physical_economy_packs gp on gp.pack_id = d.pack_id
      where gp.game_session_id = p_game_session_id
        and d.item_key = regexp_replace(
          coalesce(v_entry->>'sourceItemStableId',''),
          '^item[.]([a-z0-9_-]+)[.]v[0-9]+$',
          '\\1'
        )
      order by case gp.status when 'active' then 0 when 'staged' then 1 else 2 end
      limit 1;

      if not found then
        raise exception 'ECONOMIC_CORE_SOURCE_ITEM_UNRESOLVED:%', coalesce(v_entry->>'sourceItemStableId','') using errcode = 'P0001';
      end if;

      select gi.* into v_game_item
      from public.game_items gi
      where gi.game_session_id = p_game_session_id
        and gi.physical_item_definition_id = v_definition.id;
      if not found then
        raise exception 'ECONOMIC_CORE_GAME_ITEM_UNRESOLVED:%', v_definition.item_key using errcode = 'P0001';
      end if;

      v_old_game_item_id := v_store_item.game_item_id;

      if v_old_game_item_id is distinct from v_game_item.id and exists (
        select 1
        from public.inventory_holdings h
        where h.game_session_id = p_game_session_id
          and h.game_item_id = v_old_game_item_id
          and h.inventory_account_id <> v_store_item.inventory_account_id
          and (h.quantity_owned > 0 or h.quantity_reserved > 0)
      ) then
        raise exception 'ECONOMIC_CORE_STORE_MAPPING_HAS_OWNERSHIP:%', v_store_item.item_key
          using errcode = 'P0001',
          hint = 'Use the explicit historical ownership migration instead of remapping an active Store offer.';
      end if;

      if v_old_game_item_id is distinct from v_game_item.id and exists (
        select 1
        from public.inventory_transaction_lines l
        where l.game_session_id = p_game_session_id
          and l.game_item_id = v_old_game_item_id
      ) then
        raise exception 'ECONOMIC_CORE_STORE_MAPPING_HAS_JOURNAL_HISTORY:%', v_store_item.item_key
          using errcode = 'P0001';
      end if;

      update public.store_items
      set
        game_item_id = v_game_item.id,
        source_item_stable_id = btrim(v_entry->>'sourceItemStableId')
      where id = v_store_item.id;

      if v_old_game_item_id is distinct from v_game_item.id then
        delete from public.inventory_holdings h
        where h.game_session_id = p_game_session_id
          and h.inventory_account_id = v_store_item.inventory_account_id
          and h.game_item_id = v_old_game_item_id
          and h.quantity_reserved = 0;

        delete from public.game_items gi
        where gi.game_session_id = p_game_session_id
          and gi.id = v_old_game_item_id
          and gi.source_kind = 'store_created'
          and not exists (
            select 1 from public.store_items si where si.game_item_id = gi.id
          )
          and not exists (
            select 1 from public.inventory_holdings h where h.game_item_id = gi.id
          );
      end if;

      v_mapped := v_mapped + 1;
    end loop;
  end if;

  select count(*)::integer into v_created
  from public.game_items gi
  where gi.game_session_id = p_game_session_id;

  if exists (
    select 1
    from public.store_items si
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

revoke all on function public.sync_game_item_catalog_v2(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_game_item_catalog_v2(uuid, jsonb) to service_role;

comment on table public.game_items is
  'Canonical game-scoped identity for every physical, consumable, equipment, entitlement, service, and business-created economic item.';
comment on table public.economic_parties is
  'First-class economic owners, including players, businesses, stores, escrow, countries, and system parties.';
comment on table public.inventory_accounts is
  'Ownership/location accounts used by canonical inventory holdings and transaction lines.';
comment on table public.inventory_transactions is
  'Append-only inventory movement journal. Existing inventory_events remains a compatibility event stream during cutover.';
comment on column public.store_items.game_item_id is
  'Canonical item sold by this commercial Store offer. Store item_key remains an offer key, not item identity.';
comment on column public.inventory_holdings.store_item_id is
  'Optional legacy acquisition provenance. Canonical ownership is inventory_account_id plus game_item_id.';
comment on column public.business_products.product_kind is
  'legacy_abstract preserves existing behavior; service has no inventory output; physical_good requires an explicit output game item and bill of materials.';

commit;
