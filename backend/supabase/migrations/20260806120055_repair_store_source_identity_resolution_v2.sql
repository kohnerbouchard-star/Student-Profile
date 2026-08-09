-- Correct Store sourceItemStableId canonical-key extraction V2.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

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
      update public.game_items item_row
      set
        name = new.name,
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
      then regexp_replace(
        new.source_item_stable_id,
        '^item[.]([a-z0-9_-]+)[.]v[0-9]+$',
        '\1'
      )
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

revoke all on function economy_private.assign_store_item_context_v2()
  from public, anon, authenticated;
grant execute on function economy_private.assign_store_item_context_v2()
  to service_role;

commit;
