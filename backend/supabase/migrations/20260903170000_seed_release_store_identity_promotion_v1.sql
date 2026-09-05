-- Phase 12 certification repair: reconcile Seed canonical Store identity
-- promotion with authoritative Store seller-offer immutability.
--
-- Seed release import predates seller-offer compatibility. A fresh release first
-- creates a Store presentation row (and therefore its derived seeded offer), then
-- promotes that Store row onto the canonical game item. Ordinary Store identity
-- changes remain forbidden. This migration permits only the exact release-owned,
-- history-free projection to be removed, promotes the Store row inside the same
-- transaction, and rematerializes the derived seeded offer against the canonical
-- item before the importer returns.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.seed_release_store_identity_promotion_map_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_map_text text := nullif(
    current_setting('app.seed_release_store_identity_promotion_map', true),
    ''
  );
  v_map jsonb;
begin
  if v_map_text is null then
    return '{}'::jsonb;
  end if;

  begin
    v_map := v_map_text::jsonb;
  exception when others then
    return '{}'::jsonb;
  end;

  if jsonb_typeof(v_map) <> 'object' then
    return '{}'::jsonb;
  end if;

  return v_map;
end;
$function$;

create or replace function private.is_seed_release_store_identity_promotion_authorized_v1(
  p_game_session_id uuid,
  p_store_item_id uuid,
  p_old_game_item_id uuid,
  p_new_game_item_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_release_text text := nullif(
    current_setting('app.seed_release_store_identity_release_id', true),
    ''
  );
  v_release_id uuid;
  v_map jsonb;
  v_target_text text;
begin
  if p_game_session_id is null
     or p_store_item_id is null
     or p_old_game_item_id is null
     or p_new_game_item_id is null
     or p_old_game_item_id = p_new_game_item_id
     or v_release_text is null
  then
    return false;
  end if;

  begin
    v_release_id := v_release_text::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  v_map := private.seed_release_store_identity_promotion_map_v1();
  v_target_text := v_map ->> p_store_item_id::text;
  if v_target_text is null then
    return false;
  end if;

  begin
    if v_target_text::uuid <> p_new_game_item_id then
      return false;
    end if;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.seed_content_releases as release_row
    join public.seed_content_release_members as member_row
      on member_row.release_id = release_row.id
     and member_row.object_type = 'store_item'
     and member_row.record_id = p_store_item_id
     and member_row.created_by_release
    join public.store_items as item_row
      on item_row.id = member_row.record_id
     and item_row.game_session_id = release_row.game_session_id
     and item_row.game_item_id = p_old_game_item_id
    join public.game_items as old_item_row
      on old_item_row.id = p_old_game_item_id
     and old_item_row.game_session_id = release_row.game_session_id
    join public.game_items as new_item_row
      on new_item_row.id = p_new_game_item_id
     and new_item_row.game_session_id = release_row.game_session_id
    where release_row.id = v_release_id
      and release_row.game_session_id = p_game_session_id
      and release_row.status not in ('rolled_back', 'failed')
      and not exists (
        select 1
        from public.store_seller_offers as offer_row
        where offer_row.game_session_id = p_game_session_id
          and offer_row.store_item_id = p_store_item_id
      )
  );
end;
$function$;

create or replace function private.is_seed_release_store_offer_promotion_delete_authorized_v1(
  p_game_session_id uuid,
  p_offer_id uuid,
  p_store_item_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_release_text text := nullif(
    current_setting('app.seed_release_store_identity_release_id', true),
    ''
  );
  v_release_id uuid;
  v_map jsonb;
begin
  if p_game_session_id is null
     or p_offer_id is null
     or p_store_item_id is null
     or v_release_text is null
  then
    return false;
  end if;

  begin
    v_release_id := v_release_text::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  v_map := private.seed_release_store_identity_promotion_map_v1();
  if not (v_map ? p_store_item_id::text) then
    return false;
  end if;

  return exists (
    select 1
    from public.seed_content_releases as release_row
    join public.seed_content_release_members as member_row
      on member_row.release_id = release_row.id
     and member_row.object_type = 'store_item'
     and member_row.record_id = p_store_item_id
     and member_row.created_by_release
    join public.store_items as item_row
      on item_row.id = member_row.record_id
     and item_row.game_session_id = release_row.game_session_id
    join public.store_seller_offers as offer_row
      on offer_row.id = p_offer_id
     and offer_row.game_session_id = release_row.game_session_id
     and offer_row.store_item_id = item_row.id
     and offer_row.game_item_id = item_row.game_item_id
     and offer_row.inventory_account_id = item_row.inventory_account_id
    join public.economic_parties as party_row
      on party_row.id = offer_row.seller_party_id
     and party_row.game_session_id = offer_row.game_session_id
    where release_row.id = v_release_id
      and release_row.game_session_id = p_game_session_id
      and release_row.status not in ('rolled_back', 'failed')
      and offer_row.seller_kind = 'seeded'
      and offer_row.replenishment_policy = 'canonical_supply'
      and offer_row.creation_idempotency_key = 'seeded:' || p_store_item_id::text
      and offer_row.metadata->>'compatibilitySource' = 'store_items'
      and party_row.party_kind = 'store'
      and party_row.system_key = 'store'
      and exists (
        select 1
        from public.game_items as target_item_row
        where target_item_row.id = (v_map ->> p_store_item_id::text)::uuid
          and target_item_row.game_session_id = p_game_session_id
      )
  );
exception when invalid_text_representation then
  return false;
end;
$function$;

revoke all on function private.seed_release_store_identity_promotion_map_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.is_seed_release_store_identity_promotion_authorized_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.is_seed_release_store_offer_promotion_delete_authorized_v1(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;

create or replace function economy_private.guard_store_item_offer_identity_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if new.id is distinct from old.id
    or new.game_session_id is distinct from old.game_session_id
    or new.item_key is distinct from old.item_key
    or new.inventory_account_id is distinct from old.inventory_account_id
  then
    raise exception 'STORE_SELLER_OFFER_STORE_ITEM_IDENTITY_IMMUTABLE'
      using errcode = '42501';
  end if;

  if new.game_item_id is distinct from old.game_item_id
    and not private.is_seed_release_store_identity_promotion_authorized_v1(
      old.game_session_id,
      old.id,
      old.game_item_id,
      new.game_item_id
    )
  then
    raise exception 'STORE_SELLER_OFFER_STORE_ITEM_IDENTITY_IMMUTABLE'
      using errcode = '42501';
  end if;

  if new.currency_code is distinct from old.currency_code
    and exists (
      select 1
      from public.store_seller_offers as offer_row
      where offer_row.game_session_id = old.game_session_id
        and offer_row.store_item_id = old.id
        and offer_row.seller_kind <> 'seeded'
        and offer_row.status <> 'retired'
    )
  then
    raise exception 'STORE_SELLER_OFFER_CURRENCY_CHANGE_BLOCKED'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

create or replace function private.guard_store_seller_offer_purge_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if private.is_game_data_purge_delete_authorized_v1(
       old.game_session_id,
       tg_table_schema,
       tg_table_name
     )
     or private.is_seed_release_store_offer_delete_authorized_v1(
       old.game_session_id,
       old.id,
       old.store_item_id
     )
     or private.is_seed_release_store_offer_promotion_delete_authorized_v1(
       old.game_session_id,
       old.id,
       old.store_item_id
     )
  then
    return old;
  end if;

  raise exception 'STORE_SELLER_OFFER_DELETE_RETIRED'
    using errcode = '42501';
end;
$function$;

revoke all on function private.guard_store_seller_offer_purge_delete_v1()
  from public, anon, authenticated, service_role;

create or replace function public.apply_seed_content_release_v1(
  p_game_session_id uuid,
  p_pack_id text,
  p_version text,
  p_pack_sha256 text,
  p_target_environment text,
  p_activate boolean,
  p_authorization_id text,
  p_approved_by text,
  p_market_templates jsonb,
  p_contract_templates jsonb,
  p_store_items jsonb,
  p_fail_after_operations integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_release jsonb;
  v_catalog jsonb;
  v_release_id uuid;
  v_entry jsonb;
  v_store_item public.store_items%rowtype;
  v_current_item public.game_items%rowtype;
  v_target_item public.game_items%rowtype;
  v_source_stable_id text;
  v_source_key text;
  v_promotion_map jsonb := '{}'::jsonb;
  v_deleted integer := 0;
  v_rematerialized integer := 0;
  v_store_item_id uuid;
  v_expected_target_id uuid;
begin
  v_release := public.apply_seed_content_release_legacy_v1(
    p_game_session_id,
    p_pack_id,
    p_version,
    p_pack_sha256,
    p_target_environment,
    p_activate,
    p_authorization_id,
    p_approved_by,
    p_market_templates,
    p_contract_templates,
    p_store_items,
    p_fail_after_operations
  );

  if coalesce(v_release ->> 'outcome', '') = 'failed' then
    return v_release;
  end if;

  if p_store_items is not null then
    if jsonb_typeof(p_store_items) <> 'array' then
      raise exception 'ECONOMIC_CORE_STORE_PAYLOAD_ARRAY_REQUIRED'
        using errcode = '22023';
    end if;

    for v_entry in
      select value from jsonb_array_elements(p_store_items)
    loop
      v_source_stable_id := btrim(coalesce(v_entry->>'sourceItemStableId', ''));
      if v_source_stable_id !~ '^item[.][a-z0-9_-]+[.]v[0-9]+$' then
        raise exception 'ECONOMIC_CORE_SOURCE_ITEM_UNRESOLVED:%', v_source_stable_id
          using errcode = 'P0001';
      end if;
      v_source_key := regexp_replace(
        v_source_stable_id,
        '^item[.]([a-z0-9_-]+)[.]v[0-9]+$',
        '\1'
      );

      select item_row.*
      into v_store_item
      from public.store_items as item_row
      where item_row.game_session_id = p_game_session_id
        and item_row.item_key = lower(btrim(v_entry->>'itemKey'))
      for update;
      if not found then
        raise exception 'ECONOMIC_CORE_STORE_ITEM_NOT_FOUND:%',
          coalesce(v_entry->>'itemKey', '')
          using errcode = 'P0001';
      end if;

      select game_item_row.*
      into v_current_item
      from public.game_items as game_item_row
      where game_item_row.game_session_id = p_game_session_id
        and game_item_row.id = v_store_item.game_item_id
      for update;
      if not found then
        raise exception 'ECONOMIC_CORE_STORE_GAME_ITEM_SCOPE_INVALID:%', v_store_item.id
          using errcode = 'P0001';
      end if;

      select game_item_row.*
      into v_target_item
      from public.game_items as game_item_row
      where game_item_row.game_session_id = p_game_session_id
        and game_item_row.canonical_key = v_source_key
      limit 1
      for update;

      if found and v_target_item.id is distinct from v_current_item.id then
        v_promotion_map := v_promotion_map || jsonb_build_object(
          v_store_item.id::text,
          v_target_item.id::text
        );
      end if;
    end loop;
  end if;

  if v_promotion_map <> '{}'::jsonb then
    begin
      v_release_id := nullif(v_release->>'releaseId', '')::uuid;
      if v_release_id is null then
        raise exception 'SEED_RELEASE_IDENTITY_PROMOTION_RELEASE_ID_REQUIRED'
          using errcode = 'P0001';
      end if;

      perform set_config(
        'app.seed_release_store_identity_release_id',
        v_release_id::text,
        true
      );
      perform set_config(
        'app.seed_release_store_identity_promotion_map',
        v_promotion_map::text,
        true
      );

      delete from public.store_seller_offers as offer_row
      using public.store_items as item_row
      where item_row.game_session_id = p_game_session_id
        and v_promotion_map ? item_row.id::text
        and offer_row.game_session_id = item_row.game_session_id
        and offer_row.store_item_id = item_row.id
        and offer_row.game_item_id = item_row.game_item_id
        and offer_row.inventory_account_id = item_row.inventory_account_id
        and offer_row.seller_kind = 'seeded'
        and offer_row.replenishment_policy = 'canonical_supply'
        and offer_row.creation_idempotency_key = 'seeded:' || item_row.id::text
        and offer_row.metadata->>'compatibilitySource' = 'store_items';
      get diagnostics v_deleted = row_count;

      if v_deleted <> jsonb_object_length(v_promotion_map) then
        raise exception 'SEED_RELEASE_STORE_IDENTITY_PROMOTION_OFFER_COUNT_INVALID:%/%',
          v_deleted,
          jsonb_object_length(v_promotion_map)
          using errcode = 'P0001';
      end if;

      v_catalog := public.sync_game_item_catalog_v2(
        p_game_session_id,
        p_store_items
      );

      for v_store_item_id, v_expected_target_id in
        select promotion.key::uuid, promotion.value::uuid
        from jsonb_each_text(v_promotion_map) as promotion(key, value)
      loop
        update public.store_items as item_row
        set price = item_row.price
        where item_row.game_session_id = p_game_session_id
          and item_row.id = v_store_item_id
          and item_row.game_item_id = v_expected_target_id;
        get diagnostics v_rematerialized = row_count;

        if v_rematerialized <> 1 then
          raise exception 'SEED_RELEASE_STORE_IDENTITY_PROMOTION_STORE_ROW_INVALID:%',
            v_store_item_id
            using errcode = 'P0001';
        end if;

        if not exists (
          select 1
          from public.store_seller_offers as offer_row
          join public.store_items as item_row
            on item_row.id = offer_row.store_item_id
           and item_row.game_session_id = offer_row.game_session_id
          where offer_row.game_session_id = p_game_session_id
            and offer_row.store_item_id = v_store_item_id
            and offer_row.game_item_id = v_expected_target_id
            and offer_row.inventory_account_id = item_row.inventory_account_id
            and offer_row.seller_kind = 'seeded'
            and offer_row.replenishment_policy = 'canonical_supply'
            and offer_row.creation_idempotency_key = 'seeded:' || v_store_item_id::text
            and offer_row.metadata->>'compatibilitySource' = 'store_items'
        ) then
          raise exception 'SEED_RELEASE_STORE_IDENTITY_PROMOTION_OFFER_REBUILD_FAILED:%',
            v_store_item_id
            using errcode = 'P0001';
        end if;
      end loop;

      perform set_config('app.seed_release_store_identity_release_id', '', true);
      perform set_config('app.seed_release_store_identity_promotion_map', '', true);
    exception when others then
      perform set_config('app.seed_release_store_identity_release_id', '', true);
      perform set_config('app.seed_release_store_identity_promotion_map', '', true);
      raise;
    end;
  else
    v_catalog := public.sync_game_item_catalog_v2(
      p_game_session_id,
      p_store_items
    );
  end if;

  return v_release || jsonb_build_object(
    'economicAssetCore', v_catalog,
    'canonicalItemIdentitySynchronized', true,
    'storeIdentityPromotions', jsonb_object_length(v_promotion_map)
  );
end;
$function$;

revoke all on function public.apply_seed_content_release_v1(
  uuid, text, text, text, text, boolean, text, text,
  jsonb, jsonb, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.apply_seed_content_release_v1(
  uuid, text, text, text, text, boolean, text, text,
  jsonb, jsonb, jsonb, integer
) to service_role;

comment on function private.is_seed_release_store_identity_promotion_authorized_v1(
  uuid, uuid, uuid, uuid
) is
  'Authorizes one exact release-owned Store presentation identity promotion only while its derived seeded offer has been removed in the current Seed import transaction.';
comment on function private.is_seed_release_store_offer_promotion_delete_authorized_v1(
  uuid, uuid, uuid
) is
  'Authorizes deletion only for the exact derived seeded compatibility offer selected for canonical Store identity promotion by the current Seed release transaction.';
comment on function public.apply_seed_content_release_v1(
  uuid, text, text, text, text, boolean, text, text,
  jsonb, jsonb, jsonb, integer
) is
  'Preserves transactional Seed import/replay semantics while atomically rebuilding only release-owned seeded Store compatibility offers that require canonical game-item identity promotion.';

commit;
