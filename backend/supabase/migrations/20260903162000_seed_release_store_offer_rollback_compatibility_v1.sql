-- Phase 12 certification repair: preserve Seed release rollback semantics after
-- Store seller-offer compatibility became authoritative.
--
-- A release-created Store item now owns one derived seeded compatibility offer.
-- The Store offer FK correctly uses ON DELETE RESTRICT and Phase 11 correctly
-- blocks ordinary physical offer deletion. The pre-Store Seed rollback therefore
-- falls into its history-preserving soft-deactivation path even when the only
-- reference is the release-owned compatibility projection. This migration adds
-- one exact, transaction-local deletion authorization for that derived row only.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function private.is_seed_release_store_offer_delete_authorized_v1(
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
  v_release_setting text := nullif(
    current_setting('app.seed_release_rollback_release_id', true),
    ''
  );
  v_release_id uuid;
begin
  if p_game_session_id is null
     or p_offer_id is null
     or p_store_item_id is null
     or v_release_setting is null
  then
    return false;
  end if;

  begin
    v_release_id := v_release_setting::uuid;
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
    join public.store_seller_offers as offer_row
      on offer_row.id = p_offer_id
     and offer_row.game_session_id = release_row.game_session_id
     and offer_row.store_item_id = member_row.record_id
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
  );
end;
$function$;

revoke all on function private.is_seed_release_store_offer_delete_authorized_v1(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;

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
  then
    return old;
  end if;

  raise exception 'STORE_SELLER_OFFER_DELETE_RETIRED'
    using errcode = '42501';
end;
$function$;

revoke all on function private.guard_store_seller_offer_purge_delete_v1()
  from public, anon, authenticated, service_role;

create or replace function public.rollback_seed_content_release_legacy_v1(
  p_game_session_id uuid,
  p_pack_id text,
  p_version text,
  p_pack_sha256 text,
  p_allow_soft_rollback boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_release public.seed_content_releases%rowtype;
  v_member public.seed_content_release_members%rowtype;
  v_deleted integer := 0;
  v_soft integer := 0;
  v_other_reference boolean;
  v_previous_row jsonb;
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception using errcode = '42501', message = 'SEED_RELEASE_SERVICE_ROLE_REQUIRED';
  end if;

  select * into v_release
  from public.seed_content_releases
  where game_session_id = p_game_session_id
    and pack_id = btrim(p_pack_id)
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'SEED_RELEASE_NOT_FOUND';
  end if;
  if v_release.version <> btrim(p_version)
     or v_release.pack_sha256 <> p_pack_sha256 then
    raise exception using errcode = '23505', message = 'SEED_RELEASE_CONFLICTING_VERSION_OR_DIGEST';
  end if;

  for v_member in
    select *
    from public.seed_content_release_members
    where release_id = v_release.id
    order by case object_type
      when 'game_contract' then 1
      when 'store_item' then 2
      when 'game_stock_asset' then 3
      when 'contract_template' then 4
      when 'stock_template' then 5
      else 9
    end
  loop
    v_other_reference := exists (
      select 1
      from public.seed_content_release_members m
      join public.seed_content_releases r on r.id = m.release_id
      where m.object_type = v_member.object_type
        and m.record_id = v_member.record_id
        and r.id <> v_release.id
        and r.status not in ('rolled_back', 'failed')
    );

    v_previous_row := v_member.previous_row;

    if v_member.object_type in ('stock_template', 'contract_template')
       and v_other_reference then
      continue;
    end if;

    begin
      case v_member.object_type
        when 'game_contract' then
          delete from public.game_session_contracts
          where id = v_member.record_id
            and game_session_id = p_game_session_id;

        when 'store_item' then
          if v_member.created_by_release then
            begin
              perform set_config(
                'app.seed_release_rollback_release_id',
                v_release.id::text,
                true
              );

              delete from public.store_seller_offers as offer_row
              where offer_row.game_session_id = p_game_session_id
                and offer_row.store_item_id = v_member.record_id
                and offer_row.seller_kind = 'seeded'
                and offer_row.replenishment_policy = 'canonical_supply'
                and offer_row.creation_idempotency_key =
                    'seeded:' || v_member.record_id::text
                and offer_row.metadata->>'compatibilitySource' = 'store_items';

              perform set_config(
                'app.seed_release_rollback_release_id',
                '',
                true
              );
            exception when others then
              perform set_config(
                'app.seed_release_rollback_release_id',
                '',
                true
              );
              raise;
            end;
          end if;

          delete from public.store_items
          where id = v_member.record_id
            and game_session_id = p_game_session_id;

        when 'game_stock_asset' then
          delete from public.game_session_stock_assets
          where id = v_member.record_id
            and game_session_id = p_game_session_id;

        when 'contract_template' then
          if v_member.created_by_release then
            delete from public.contract_templates where id = v_member.record_id;
          elsif v_previous_row is not null then
            update public.contract_templates
            set template_key = v_previous_row->>'template_key',
                title = v_previous_row->>'title',
                description = v_previous_row->>'description',
                instructions = v_previous_row->>'instructions',
                category = v_previous_row->>'category',
                difficulty = v_previous_row->>'difficulty',
                estimated_duration_minutes = nullif(v_previous_row->>'estimated_duration_minutes', '')::integer,
                requirements_payload = coalesce(v_previous_row->'requirements_payload', '{}'::jsonb),
                reward_payload = coalesce(v_previous_row->'reward_payload', '{}'::jsonb),
                metadata = coalesce(v_previous_row->'metadata', '{}'::jsonb),
                is_active = coalesce((v_previous_row->>'is_active')::boolean, false),
                updated_at = now()
            where id = v_member.record_id;
          end if;

        when 'stock_template' then
          if v_member.created_by_release then
            delete from public.stock_templates where id = v_member.record_id;
          elsif v_previous_row is not null then
            update public.stock_templates
            set ticker = v_previous_row->>'ticker',
                company_name = v_previous_row->>'company_name',
                sector_key = v_previous_row->>'sector_key',
                country_code = v_previous_row->>'country_code',
                description = v_previous_row->>'description',
                base_price = nullif(v_previous_row->>'base_price', '')::numeric,
                beta = nullif(v_previous_row->>'beta', '')::numeric,
                liquidity = nullif(v_previous_row->>'liquidity', '')::numeric,
                long_run_volatility = nullif(v_previous_row->>'long_run_volatility', '')::numeric,
                shares_outstanding = nullif(v_previous_row->>'shares_outstanding', '')::numeric,
                fundamentals = coalesce(v_previous_row->'fundamentals', '{}'::jsonb),
                country_exposure = coalesce(v_previous_row->'country_exposure', '{}'::jsonb),
                sector_exposure = coalesce(v_previous_row->'sector_exposure', '{}'::jsonb),
                commodity_exposure = coalesce(v_previous_row->'commodity_exposure', '{}'::jsonb),
                is_active = coalesce((v_previous_row->>'is_active')::boolean, false),
                updated_at = now()
            where id = v_member.record_id;
          end if;
      end case;

      if found then
        v_deleted := v_deleted + 1;
      end if;
    exception when foreign_key_violation then
      if not p_allow_soft_rollback then
        raise;
      end if;

      case v_member.object_type
        when 'game_contract' then
          update public.game_session_contracts
          set status = 'archived', visibility = 'hidden', published_at = null, updated_at = now()
          where id = v_member.record_id;
        when 'store_item' then
          update public.store_items
          set status = 'archived', visibility = 'hidden', updated_at = now()
          where id = v_member.record_id;
        when 'game_stock_asset' then
          update public.game_session_stock_assets
          set is_active = false, updated_at = now()
          where id = v_member.record_id;
        when 'contract_template' then
          update public.contract_templates
          set is_active = false, updated_at = now()
          where id = v_member.record_id;
        when 'stock_template' then
          update public.stock_templates
          set is_active = false, updated_at = now()
          where id = v_member.record_id;
      end case;
      v_soft := v_soft + 1;
    end;
  end loop;

  update public.seed_content_releases
  set status = 'rolled_back',
      rolled_back_at = now(),
      updated_at = now(),
      result = result || jsonb_build_object(
        'rolledBackAt', now(),
        'deletedRecords', v_deleted,
        'softDeactivatedRecords', v_soft
      )
  where id = v_release.id;

  return jsonb_build_object(
    'outcome', 'rolled_back',
    'releaseId', v_release.id,
    'gameSessionId', p_game_session_id,
    'deleted', v_deleted,
    'softDeactivated', v_soft,
    'playerHistoryPreserved', true
  );
end;
$function$;

revoke all on function public.rollback_seed_content_release_legacy_v1(
  uuid, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.rollback_seed_content_release_legacy_v1(
  uuid, text, text, text, boolean
) to service_role;

comment on function private.is_seed_release_store_offer_delete_authorized_v1(
  uuid, uuid, uuid
) is
  'Authorizes deletion only for the exact release-created seeded Store compatibility offer while that Seed release rollback is executing in the current transaction.';
comment on function public.rollback_seed_content_release_legacy_v1(
  uuid, text, text, text, boolean
) is
  'History-preserving Seed release rollback with exact cleanup of release-owned seeded Store compatibility offers before their Store presentation rows are removed.';

commit;
