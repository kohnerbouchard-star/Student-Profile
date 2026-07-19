begin;

-- New Store settlements require an active game. The current lifecycle schema uses
-- disabled as the reversible mutation-stop state and archived as the terminal
-- state. Completed idempotent replays remain available after either transition so
-- callers can recover an authoritative receipt without creating another mutation.
create or replace function public.purchase_quoted_store_item_public_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_idempotency_key text,
  p_client_submitted_at timestamptz default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  receipt_key text,
  quote_key text,
  item_key text,
  item_name text,
  quantity integer,
  final_unit_price numeric,
  final_total_price numeric,
  currency_code text,
  inventory_quantity_owned integer,
  completed_at timestamptz,
  already_completed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote_id uuid;
  v_result record;
  v_replay boolean;
  v_game_status text;
begin
  select q.id into v_quote_id
  from public.store_purchase_quotes q
  where q.public_quote_key = lower(btrim(p_quote_key))
    and q.game_session_id = p_game_session_id
    and q.player_id = p_player_id;

  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.store_purchases p
    where p.game_session_id = p_game_session_id
      and p.player_id = p_player_id
      and p.idempotency_key = btrim(p_idempotency_key)
      and p.status = 'COMPLETED'
  ) into v_replay;

  if not v_replay then
    select game.status
    into v_game_status
    from public.game_sessions game
    where game.id = p_game_session_id
    for share;

    if not found then
      raise exception 'GAME_SESSION_NOT_FOUND' using errcode = 'P0001';
    end if;

    if v_game_status = 'disabled' then
      raise exception 'GAME_SESSION_DISABLED' using errcode = 'P0001';
    end if;

    if v_game_status = 'archived' then
      raise exception 'GAME_SESSION_ARCHIVED' using errcode = 'P0001';
    end if;

    if v_game_status <> 'active' then
      raise exception 'GAME_SESSION_NOT_ACTIVE' using errcode = 'P0001';
    end if;
  end if;

  select * into v_result
  from public.purchase_quoted_store_item(
    p_game_session_id,
    p_player_id,
    v_quote_id,
    p_idempotency_key,
    p_client_submitted_at,
    coalesce(p_request_metadata, '{}'::jsonb)
  );

  return query
  select
    p.public_receipt_key,
    q.public_quote_key,
    i.item_key,
    i.name,
    p.quantity,
    p.final_unit_price,
    p.final_total_price,
    p.currency_code,
    coalesce(h.quantity_owned, 0),
    p.created_at,
    v_replay
  from public.store_purchases p
  join public.store_purchase_quotes q on q.id = p.quote_id
  join public.store_items i on i.id = p.store_item_id
  left join public.inventory_holdings h
    on h.game_session_id = p.game_session_id
   and h.player_id = p.player_id
   and h.store_item_id = p.store_item_id
  where p.id = v_result.purchase_id
    and p.game_session_id = p_game_session_id
    and p.player_id = p_player_id;
end;
$$;

comment on function public.purchase_quoted_store_item_public_v1(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  jsonb
) is
  'Completes a public-key Store purchase only while the game is active. Exact completed idempotent replays remain available after the game is disabled or archived.';

revoke all on function public.purchase_quoted_store_item_public_v1(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated;
grant execute on function public.purchase_quoted_store_item_public_v1(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  jsonb
) to service_role;

commit;
