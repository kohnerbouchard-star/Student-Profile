-- Phase 12 certification repair: permit only an exact Seed-release canonical
-- Store identity promotion while preserving ordinary Store and seller-offer
-- immutability. No Player, Business, purchase, or live-runtime authority is added.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function private.is_seed_store_identity_promotion_authorized_v1(
  p_game_session_id uuid,
  p_store_item_id uuid,
  p_source_game_item_id uuid,
  p_target_game_item_id uuid,
  p_offer_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_release_setting text := nullif(current_setting(
    'app.seed_store_identity_promotion_release_id', true
  ), '');
  v_store_setting text := nullif(current_setting(
    'app.seed_store_identity_promotion_store_item_id', true
  ), '');
  v_source_setting text := nullif(current_setting(
    'app.seed_store_identity_promotion_source_game_item_id', true
  ), '');
  v_target_setting text := nullif(current_setting(
    'app.seed_store_identity_promotion_target_game_item_id', true
  ), '');
  v_offer_setting text := nullif(current_setting(
    'app.seed_store_identity_promotion_offer_id', true
  ), '');
  v_release_id uuid;
  v_store_item_id uuid;
  v_source_game_item_id uuid;
  v_target_game_item_id uuid;
  v_offer_id uuid;
begin
  if p_game_session_id is null
     or p_store_item_id is null
     or p_source_game_item_id is null
     or p_target_game_item_id is null
     or v_release_setting is null
     or v_store_setting is null
     or v_source_setting is null
     or v_target_setting is null
  then
    return false;
  end if;

  begin
    v_release_id := v_release_setting::uuid;
    v_store_item_id := v_store_setting::uuid;
    v_source_game_item_id := v_source_setting::uuid;
    v_target_game_item_id := v_target_setting::uuid;
    if v_offer_setting is not null then
      v_offer_id := v_offer_setting::uuid;
    end if;
  exception when invalid_text_representation then
    return false;
  end;

  if v_store_item_id <> p_store_item_id
     or v_source_game_item_id <> p_source_game_item_id
     or v_target_game_item_id <> p_target_game_item_id
     or (p_offer_id is not null and v_offer_id is distinct from p_offer_id)
  then
    return false;
  end if;

  if not exists (
    select 1
    from public.seed_content_releases as release_row
    join public.seed_content_release_members as member_row
      on member_row.release_id = release_row.id
     and member_row.object_type = 'store_item'
     and member_row.record_id = p_store_item_id
     and member_row.created_by_release
    where release_row.id = v_release_id
      and release_row.game_session_id = p_game_session_id
      and release_row.status not in ('rolled_back', 'failed')
  ) or not exists (
    select 1
    from public.game_items as target_item
    where target_item.game_session_id = p_game_session_id
      and target_item.id = p_target_game_item_id
  )
  then
    return false;
  end if;

  if p_offer_id is null then
    return exists (
      select 1
      from public.store_items as store_item
      where store_item.game_session_id = p_game_session_id
        and store_item.id = p_store_item_id
        and store_item.game_item_id = p_source_game_item_id
    );
  end if;

  return exists (
    select 1
    from public.store_items as store_item
    join public.store_seller_offers as offer_row
      on offer_row.id = p_offer_id
     and offer_row.game_session_id = store_item.game_session_id
     and offer_row.store_item_id = store_item.id
    join public.economic_parties as party_row
      on party_row.id = offer_row.seller_party_id
     and party_row.game_session_id = offer_row.game_session_id
    where store_item.game_session_id = p_game_session_id
      and store_item.id = p_store_item_id
      and store_item.game_item_id = p_target_game_item_id
      and offer_row.game_item_id = p_source_game_item_id
      and offer_row.seller_kind = 'seeded'
      and offer_row.replenishment_policy = 'canonical_supply'
      and offer_row.creation_idempotency_key =
          'seeded:' || p_store_item_id::text
      and offer_row.metadata->>'compatibilitySource' = 'store_items'
      and party_row.party_kind = 'store'
      and party_row.system_key = 'store'
  );
end;
$function$;

revoke all on function private.is_seed_store_identity_promotion_authorized_v1(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;

create or replace function economy_private.guard_store_item_offer_identity_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, economy_private, pg_temp
as $function$
begin
  if new.id is distinct from old.id
    or new.game_session_id is distinct from old.game_session_id
    or new.item_key is distinct from old.item_key
    or new.inventory_account_id is distinct from old.inventory_account_id
    or (
      new.game_item_id is distinct from old.game_item_id
      and not private.is_seed_store_identity_promotion_authorized_v1(
        old.game_session_id,
        old.id,
        old.game_item_id,
        new.game_item_id,
        null
      )
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

revoke all on function economy_private.guard_store_item_offer_identity_v2()
  from public, anon, authenticated, service_role;

do $patch_offer_guard$
declare
  v_definition text;
  v_before constant text := E'      or new.game_item_id is distinct from old.game_item_id\n      or new.seller_party_id is distinct from old.seller_party_id';
  v_after constant text := E'      or (\n        new.game_item_id is distinct from old.game_item_id\n        and not private.is_seed_store_identity_promotion_authorized_v1(\n          old.game_session_id,\n          old.store_item_id,\n          old.game_item_id,\n          new.game_item_id,\n          old.id\n        )\n      )\n      or new.seller_party_id is distinct from old.seller_party_id';
begin
  select pg_catalog.pg_get_functiondef(
    'economy_private.guard_store_seller_offer_v2()'::regprocedure
  ) into v_definition;

  if position(v_after in v_definition) > 0 then
    null;
  elsif position(v_before in v_definition) = 0 then
    raise exception 'SEED_STORE_IDENTITY_OFFER_GUARD_PATCH_SOURCE_MISSING'
      using errcode = 'P0001';
  else
    execute replace(v_definition, v_before, v_after);
  end if;
end;
$patch_offer_guard$;

create or replace function economy_private.promote_store_game_item_key_v2(
  p_game_session_id uuid,
  p_store_item_id uuid,
  p_canonical_key text,
  p_source_item_stable_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, economy_private, pg_temp
as $function$
declare
  v_store_item public.store_items%rowtype;
  v_current_item public.game_items%rowtype;
  v_target_item public.game_items%rowtype;
  v_release_id uuid;
  v_seeded_offer_id uuid;
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
  from public.store_items as si
  where si.game_session_id = p_game_session_id
    and si.id = p_store_item_id
  for update;
  if not found or v_store_item.game_item_id is null then
    raise exception 'ECONOMIC_CORE_STORE_GAME_ITEM_REQUIRED:%', p_store_item_id
      using errcode = 'P0001';
  end if;

  select gi.* into v_current_item
  from public.game_items as gi
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
  from public.game_items as gi
  where gi.game_session_id = p_game_session_id
    and gi.canonical_key = v_key
  limit 1
  for update;

  if found and v_target_item.id is distinct from v_current_item.id then
    if exists (
      select 1
      from public.inventory_holdings as holding_row
      where holding_row.game_session_id = p_game_session_id
        and holding_row.game_item_id = v_current_item.id
        and holding_row.inventory_account_id <> v_store_item.inventory_account_id
        and (holding_row.quantity_owned > 0 or holding_row.quantity_reserved > 0)
    ) then
      raise exception 'ECONOMIC_CORE_STORE_MAPPING_HAS_OWNERSHIP:%', v_store_item.item_key
        using errcode = 'P0001',
        hint = 'Use the explicit historical ownership migration instead of remapping an active Store offer.';
    end if;

    if exists (
      select 1
      from public.inventory_transaction_lines as line_row
      where line_row.game_session_id = p_game_session_id
        and line_row.game_item_id = v_current_item.id
    ) then
      raise exception 'ECONOMIC_CORE_STORE_MAPPING_HAS_JOURNAL_HISTORY:%', v_store_item.item_key
        using errcode = 'P0001';
    end if;

    select release_row.id into v_release_id
    from public.seed_content_release_members as member_row
    join public.seed_content_releases as release_row
      on release_row.id = member_row.release_id
     and release_row.game_session_id = p_game_session_id
    where member_row.object_type = 'store_item'
      and member_row.record_id = p_store_item_id
      and member_row.created_by_release
      and release_row.status not in ('rolled_back', 'failed')
    order by release_row.created_at desc, release_row.id
    limit 1;
    if not found then
      raise exception 'ECONOMIC_CORE_STORE_MAPPING_IDENTITY_IMMUTABLE:%', v_store_item.item_key
        using errcode = '42501';
    end if;

    select offer_row.id into v_seeded_offer_id
    from public.store_seller_offers as offer_row
    join public.economic_parties as party_row
      on party_row.id = offer_row.seller_party_id
     and party_row.game_session_id = offer_row.game_session_id
    where offer_row.game_session_id = p_game_session_id
      and offer_row.store_item_id = p_store_item_id
      and offer_row.game_item_id = v_current_item.id
      and offer_row.seller_kind = 'seeded'
      and offer_row.replenishment_policy = 'canonical_supply'
      and offer_row.creation_idempotency_key =
          'seeded:' || p_store_item_id::text
      and offer_row.metadata->>'compatibilitySource' = 'store_items'
      and party_row.party_kind = 'store'
      and party_row.system_key = 'store'
    for update of offer_row;

    if exists (
      select 1
      from public.store_seller_offers as offer_row
      where offer_row.game_session_id = p_game_session_id
        and offer_row.store_item_id = p_store_item_id
        and offer_row.id is distinct from v_seeded_offer_id
    ) then
      raise exception 'ECONOMIC_CORE_STORE_MAPPING_HAS_OFFER_HISTORY:%', v_store_item.item_key
        using errcode = 'P0001';
    end if;

    if v_seeded_offer_id is not null and (
      exists (
        select 1 from public.store_offer_purchase_quotes as quote_row
        where quote_row.game_session_id = p_game_session_id
          and quote_row.offer_id = v_seeded_offer_id
      )
      or exists (
        select 1 from public.store_offer_purchase_receipts as receipt_row
        where receipt_row.game_session_id = p_game_session_id
          and receipt_row.offer_id = v_seeded_offer_id
      )
      or exists (
        select 1 from public.store_offer_withdrawal_requests as withdrawal_row
        where withdrawal_row.game_session_id = p_game_session_id
          and withdrawal_row.offer_id = v_seeded_offer_id
      )
      or exists (
        select 1 from public.store_purchase_quotes as legacy_quote_row
        where legacy_quote_row.game_session_id = p_game_session_id
          and legacy_quote_row.seller_offer_id = v_seeded_offer_id
      )
    ) then
      raise exception 'ECONOMIC_CORE_STORE_MAPPING_HAS_OFFER_HISTORY:%', v_store_item.item_key
        using errcode = 'P0001';
    end if;

    perform set_config(
      'app.seed_store_identity_promotion_release_id',
      v_release_id::text,
      true
    );
    perform set_config(
      'app.seed_store_identity_promotion_store_item_id',
      p_store_item_id::text,
      true
    );
    perform set_config(
      'app.seed_store_identity_promotion_source_game_item_id',
      v_current_item.id::text,
      true
    );
    perform set_config(
      'app.seed_store_identity_promotion_target_game_item_id',
      v_target_item.id::text,
      true
    );
    perform set_config(
      'app.seed_store_identity_promotion_offer_id',
      coalesce(v_seeded_offer_id::text, ''),
      true
    );

    begin
      update public.store_items
      set
        game_item_id = v_target_item.id,
        source_item_stable_id = coalesce(v_source_stable_id, source_item_stable_id)
      where game_session_id = p_game_session_id
        and id = p_store_item_id;

      if v_seeded_offer_id is not null then
        update public.store_seller_offers
        set
          game_item_id = v_target_item.id,
          version = version + 1
        where game_session_id = p_game_session_id
          and id = v_seeded_offer_id;
        if not found then
          raise exception 'ECONOMIC_CORE_SEEDED_OFFER_PROMOTION_MISSING:%', v_store_item.item_key
            using errcode = 'P0001';
        end if;
      end if;

      perform set_config('app.seed_store_identity_promotion_release_id', '', true);
      perform set_config('app.seed_store_identity_promotion_store_item_id', '', true);
      perform set_config('app.seed_store_identity_promotion_source_game_item_id', '', true);
      perform set_config('app.seed_store_identity_promotion_target_game_item_id', '', true);
      perform set_config('app.seed_store_identity_promotion_offer_id', '', true);
    exception when others then
      perform set_config('app.seed_store_identity_promotion_release_id', '', true);
      perform set_config('app.seed_store_identity_promotion_store_item_id', '', true);
      perform set_config('app.seed_store_identity_promotion_source_game_item_id', '', true);
      perform set_config('app.seed_store_identity_promotion_target_game_item_id', '', true);
      perform set_config('app.seed_store_identity_promotion_offer_id', '', true);
      raise;
    end;

    delete from public.inventory_holdings as holding_row
    where holding_row.game_session_id = p_game_session_id
      and holding_row.inventory_account_id = v_store_item.inventory_account_id
      and holding_row.game_item_id = v_current_item.id
      and holding_row.quantity_reserved = 0;

    delete from public.game_items as game_item_row
    where game_item_row.game_session_id = p_game_session_id
      and game_item_row.id = v_current_item.id
      and game_item_row.source_kind = 'store_created'
      and not exists (
        select 1 from public.store_items as store_item
        where store_item.game_item_id = game_item_row.id
      )
      and not exists (
        select 1 from public.inventory_holdings as holding_row
        where holding_row.game_item_id = game_item_row.id
      );

    return v_target_item.id;
  end if;

  update public.game_items as game_item_row
  set
    canonical_key = v_key,
    metadata = coalesce(game_item_row.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'canonicalIdentityPendingPhysicalPack',
        game_item_row.physical_item_definition_id is null
      )
      || case
        when v_source_stable_id is null then '{}'::jsonb
        else jsonb_build_object('sourceItemStableId', v_source_stable_id)
      end,
    version = game_item_row.version + 1,
    updated_at = now()
  where game_item_row.game_session_id = p_game_session_id
    and game_item_row.id = v_current_item.id
  returning game_item_row.* into v_current_item;

  if v_source_stable_id is not null
    and v_store_item.source_item_stable_id is distinct from v_source_stable_id
  then
    update public.store_items
    set source_item_stable_id = v_source_stable_id
    where game_session_id = p_game_session_id
      and id = p_store_item_id;
  end if;

  return v_current_item.id;
end;
$function$;

revoke all on function economy_private.promote_store_game_item_key_v2(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function economy_private.promote_store_game_item_key_v2(
  uuid, uuid, text, text
) to service_role;

do $assert$
begin
  if pg_catalog.pg_get_functiondef(
      'economy_private.guard_store_item_offer_identity_v2()'::regprocedure
    ) not like '%is_seed_store_identity_promotion_authorized_v1%'
    or pg_catalog.pg_get_functiondef(
      'economy_private.guard_store_seller_offer_v2()'::regprocedure
    ) not like '%is_seed_store_identity_promotion_authorized_v1%'
    or pg_catalog.pg_get_functiondef(
      'economy_private.promote_store_game_item_key_v2(uuid,uuid,text,text)'::regprocedure
    ) not like '%ECONOMIC_CORE_STORE_MAPPING_HAS_OFFER_HISTORY%'
  then
    raise exception 'SEED_STORE_IDENTITY_PROMOTION_COMPATIBILITY_INCOMPLETE'
      using errcode = 'P0001';
  end if;
end;
$assert$;

comment on function private.is_seed_store_identity_promotion_authorized_v1(
  uuid, uuid, uuid, uuid, uuid
) is
  'Authorizes only the exact release-created Store presentation and derived seeded offer identity promotion in the current Seed import transaction.';
comment on function economy_private.promote_store_game_item_key_v2(
  uuid, uuid, text, text
) is
  'Promotes a release-created Store item and its history-free seeded compatibility offer to one canonical game item without weakening ordinary offer identity.';

commit;
