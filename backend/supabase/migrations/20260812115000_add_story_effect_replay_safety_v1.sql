begin;

alter table public.player_story_impacts
  add column if not exists idempotency_key text;

alter table public.player_story_impacts
  drop constraint if exists player_story_impacts_idempotency_key_valid;
alter table public.player_story_impacts
  add constraint player_story_impacts_idempotency_key_valid check (
    idempotency_key is null
    or (
      length(idempotency_key) between 8 and 320
      and idempotency_key = btrim(idempotency_key)
    )
  ) not valid;
alter table public.player_story_impacts
  validate constraint player_story_impacts_idempotency_key_valid;

create unique index if not exists player_story_impacts_idempotency_unique
  on public.player_story_impacts (game_session_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.player_story_impacts.idempotency_key is
  'Deterministic Story effect identity. Replayed Story execution must reuse the existing impact instead of creating another consequence.';

create table if not exists public.story_cash_adjustments (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  player_id uuid not null,
  storyline_event_id uuid not null references public.storyline_events (id) on delete cascade,
  idempotency_key text not null,
  effect_type text not null,
  amount numeric(18, 4) not null,
  signed_amount numeric(18, 4) not null,
  currency_code text not null,
  ledger_entry_id uuid not null references public.ledger_entries (id) on delete restrict,
  balance_after numeric(18, 4) not null,
  created_at timestamptz not null default now(),
  constraint story_cash_adjustments_player_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id) on delete cascade,
  constraint story_cash_adjustments_idempotency_unique
    unique (game_session_id, idempotency_key),
  constraint story_cash_adjustments_idempotency_valid check (
    length(idempotency_key) between 8 and 320
    and idempotency_key = btrim(idempotency_key)
  ),
  constraint story_cash_adjustments_effect_valid check (
    effect_type in ('cash_credit', 'cash_debit')
  ),
  constraint story_cash_adjustments_amount_valid check (
    amount > 0
    and signed_amount <> 0
    and (
      (effect_type = 'cash_credit' and signed_amount = amount)
      or (effect_type = 'cash_debit' and signed_amount = -amount)
    )
  ),
  constraint story_cash_adjustments_currency_valid check (
    currency_code = upper(btrim(currency_code))
    and length(currency_code) between 3 and 16
  )
);

create index if not exists story_cash_adjustments_player_created_idx
  on public.story_cash_adjustments (game_session_id, player_id, created_at desc);

alter table public.story_cash_adjustments enable row level security;
revoke all on table public.story_cash_adjustments
  from public, anon, authenticated, service_role;
grant select, insert on table public.story_cash_adjustments to service_role;

create or replace function public.apply_story_cash_adjustment_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_storyline_event_id uuid,
  p_effect_type text,
  p_amount numeric,
  p_signed_amount numeric,
  p_label text,
  p_reason text,
  p_payload jsonb,
  p_idempotency_key text,
  p_applied_at timestamptz default clock_timestamp()
)
returns table (
  adjustment_outcome text,
  adjustment_id uuid,
  ledger_entry_id uuid,
  currency_code text,
  balance numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_effect_type text := lower(btrim(coalesce(p_effect_type, '')));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_existing public.story_cash_adjustments%rowtype;
  v_currency_code text;
  v_ledger record;
  v_adjustment public.story_cash_adjustments%rowtype;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_storyline_event_id is null
    or v_effect_type not in ('cash_credit', 'cash_debit')
    or p_amount is null or p_amount <= 0
    or p_signed_amount is null or p_signed_amount = 0
    or (v_effect_type = 'cash_credit' and p_signed_amount <> p_amount)
    or (v_effect_type = 'cash_debit' and p_signed_amount <> -p_amount)
    or length(btrim(coalesce(p_label, ''))) = 0
    or length(btrim(coalesce(p_reason, ''))) = 0
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
    or length(v_key) not between 8 and 320
    or p_applied_at is null
  then
    raise exception 'STORY_CASH_ADJUSTMENT_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_game_session_id::text || ':' || v_key, 121150)
  );

  select adjustment_row.*
  into v_existing
  from public.story_cash_adjustments as adjustment_row
  where adjustment_row.game_session_id = p_game_session_id
    and adjustment_row.idempotency_key = v_key;

  if found then
    if v_existing.player_id <> p_player_id
      or v_existing.storyline_event_id <> p_storyline_event_id
      or v_existing.effect_type <> v_effect_type
      or v_existing.amount <> p_amount
      or v_existing.signed_amount <> p_signed_amount
    then
      raise exception 'STORY_CASH_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query select
      'replayed'::text,
      v_existing.id,
      v_existing.ledger_entry_id,
      v_existing.currency_code,
      v_existing.balance_after;
    return;
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active';
  if not found then
    raise exception 'STORY_CASH_PLAYER_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  perform 1
  from public.storyline_events as event_row
  where event_row.id = p_storyline_event_id;
  if not found then
    raise exception 'STORY_CASH_EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select upper(btrim(country.currency_code))
  into v_currency_code
  from public.player_country_assignments as assignment
  join public.country_profiles as country
    on country.id = assignment.country_profile_id
   and country.status = 'active'
  where assignment.game_session_id = p_game_session_id
    and assignment.player_id = p_player_id
    and assignment.status = 'active'
  order by assignment.assigned_at desc
  limit 1;

  if coalesce(v_currency_code, '') = '' then
    raise exception 'STORY_CASH_PLAYER_CURRENCY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select *
  into v_ledger
  from public.record_player_ledger_entry(
    p_game_session_id,
    p_player_id,
    'checking',
    p_signed_amount,
    v_currency_code,
    case when v_effect_type = 'cash_credit' then 'credit' else 'debit' end,
    'storylines',
    v_effect_type,
    p_storyline_event_id,
    'system',
    null,
    jsonb_build_object(
      'idempotencyKey', v_key,
      'storylineEventId', p_storyline_event_id,
      'effectType', v_effect_type,
      'label', btrim(p_label),
      'reason', btrim(p_reason),
      'amount', p_amount,
      'signedAmount', p_signed_amount,
      'payload', coalesce(p_payload, '{}'::jsonb),
      'source', 'apply_story_cash_adjustment_v1',
      'resolvedCurrencyCode', v_currency_code
    )
  );

  insert into public.story_cash_adjustments (
    game_session_id,
    player_id,
    storyline_event_id,
    idempotency_key,
    effect_type,
    amount,
    signed_amount,
    currency_code,
    ledger_entry_id,
    balance_after,
    created_at
  ) values (
    p_game_session_id,
    p_player_id,
    p_storyline_event_id,
    v_key,
    v_effect_type,
    p_amount,
    p_signed_amount,
    v_currency_code,
    v_ledger.ledger_entry_id,
    v_ledger.balance,
    p_applied_at
  )
  returning * into v_adjustment;

  return query select
    'applied'::text,
    v_adjustment.id,
    v_adjustment.ledger_entry_id,
    v_adjustment.currency_code,
    v_adjustment.balance_after;
end;
$function$;

revoke all on function public.apply_story_cash_adjustment_v1(
  uuid, uuid, uuid, text, numeric, numeric, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_story_cash_adjustment_v1(
  uuid, uuid, uuid, text, numeric, numeric, text, text, jsonb, text, timestamptz
) to service_role;

comment on function public.apply_story_cash_adjustment_v1(
  uuid, uuid, uuid, text, numeric, numeric, text, text, jsonb, text, timestamptz
) is
  'Atomically applies one Story cash effect to canonical Checking in the player active-country currency and replays the same ledger result by deterministic Story idempotency key.';

commit;
