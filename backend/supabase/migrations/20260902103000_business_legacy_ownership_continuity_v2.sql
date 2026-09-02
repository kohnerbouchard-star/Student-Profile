-- Business V2 Phase 12 compatibility repair: preserve canonical ownership evidence
-- for retained ownership-model-v1 creation after the Phase 0 one-time backfill.
--
-- The legacy create_or_acquire_player_business_v1 path remains a bounded
-- compatibility seam. Businesses created through that seam after
-- 20260819062000 must receive the same canonical ownership position,
-- immutable formation transaction, and corporation share structure that the
-- original Phase 0 migration backfilled for businesses which already existed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.ensure_legacy_business_ownership_continuity_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if new.ownership_model_version <> 1 or new.owner_player_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.business_ownership_positions as position_row
    where position_row.game_session_id = new.game_session_id
      and position_row.business_id = new.id
      and position_row.player_id = new.owner_player_id
      and position_row.status = 'active'
  ) then
    insert into public.business_ownership_positions (
      game_session_id,
      business_id,
      player_id,
      ownership_kind,
      units,
      voting_units,
      status,
      effective_at
    ) values (
      new.game_session_id,
      new.id,
      new.owner_player_id,
      public.business_ownership_kind_v2(new.entity_type),
      10000,
      10000,
      'active',
      new.created_at
    );
  end if;

  if not exists (
    select 1
    from public.business_ownership_transactions as transaction_row
    where transaction_row.game_session_id = new.game_session_id
      and transaction_row.business_id = new.id
      and transaction_row.idempotency_key = 'legacy-backfill:' || new.public_key
  ) then
    insert into public.business_ownership_transactions (
      game_session_id,
      business_id,
      transaction_kind,
      ownership_kind,
      from_player_id,
      to_player_id,
      units,
      voting_units,
      consideration_amount,
      currency_code,
      idempotency_key,
      metadata,
      created_at
    ) values (
      new.game_session_id,
      new.id,
      'formation',
      public.business_ownership_kind_v2(new.entity_type),
      null,
      new.owner_player_id,
      10000,
      10000,
      new.capitalization,
      new.currency_code,
      'legacy-backfill:' || new.public_key,
      jsonb_build_object(
        'legacyBackfill', true,
        'ownershipModelVersion', 1,
        'source', 'owner_player_id'
      ),
      new.created_at
    );
  end if;

  if new.entity_type in ('corporation', 'c_corporation') then
    insert into public.business_corporate_share_structures (
      game_session_id,
      business_id,
      authorized_shares,
      issued_shares,
      treasury_shares,
      outstanding_shares
    ) values (
      new.game_session_id,
      new.id,
      1000000,
      10000,
      0,
      10000
    )
    on conflict (game_session_id, business_id) do nothing;
  end if;

  return new;
end
$function$;

revoke all on function public.ensure_legacy_business_ownership_continuity_v2()
  from public, anon, authenticated;

drop trigger if exists ensure_legacy_business_ownership_continuity_v2
  on public.business_entities;
create trigger ensure_legacy_business_ownership_continuity_v2
after insert on public.business_entities
for each row
when (new.ownership_model_version = 1 and new.owner_player_id is not null)
execute function public.ensure_legacy_business_ownership_continuity_v2();

-- Repair any model-v1 rows created after the original one-time backfill and
-- before this forward trigger was installed.
insert into public.business_ownership_positions (
  game_session_id,
  business_id,
  player_id,
  ownership_kind,
  units,
  voting_units,
  status,
  effective_at
)
select
  business_row.game_session_id,
  business_row.id,
  business_row.owner_player_id,
  public.business_ownership_kind_v2(business_row.entity_type),
  10000,
  10000,
  'active',
  business_row.created_at
from public.business_entities as business_row
where business_row.ownership_model_version = 1
  and business_row.owner_player_id is not null
  and not exists (
    select 1
    from public.business_ownership_positions as position_row
    where position_row.game_session_id = business_row.game_session_id
      and position_row.business_id = business_row.id
      and position_row.player_id = business_row.owner_player_id
      and position_row.status = 'active'
  );

insert into public.business_ownership_transactions (
  game_session_id,
  business_id,
  transaction_kind,
  ownership_kind,
  from_player_id,
  to_player_id,
  units,
  voting_units,
  consideration_amount,
  currency_code,
  idempotency_key,
  metadata,
  created_at
)
select
  business_row.game_session_id,
  business_row.id,
  'formation',
  public.business_ownership_kind_v2(business_row.entity_type),
  null,
  business_row.owner_player_id,
  10000,
  10000,
  business_row.capitalization,
  business_row.currency_code,
  'legacy-backfill:' || business_row.public_key,
  jsonb_build_object(
    'legacyBackfill', true,
    'ownershipModelVersion', 1,
    'source', 'owner_player_id'
  ),
  business_row.created_at
from public.business_entities as business_row
where business_row.ownership_model_version = 1
  and business_row.owner_player_id is not null
  and not exists (
    select 1
    from public.business_ownership_transactions as transaction_row
    where transaction_row.game_session_id = business_row.game_session_id
      and transaction_row.business_id = business_row.id
      and transaction_row.idempotency_key = 'legacy-backfill:' || business_row.public_key
  );

insert into public.business_corporate_share_structures (
  game_session_id,
  business_id,
  authorized_shares,
  issued_shares,
  treasury_shares,
  outstanding_shares
)
select
  business_row.game_session_id,
  business_row.id,
  1000000,
  10000,
  0,
  10000
from public.business_entities as business_row
where business_row.ownership_model_version = 1
  and business_row.entity_type in ('corporation', 'c_corporation')
on conflict (game_session_id, business_id) do nothing;

comment on function public.ensure_legacy_business_ownership_continuity_v2() is
  'Ensures retained model-v1 Business creation receives the same canonical ownership evidence as the Phase 0 legacy backfill.';

commit;
