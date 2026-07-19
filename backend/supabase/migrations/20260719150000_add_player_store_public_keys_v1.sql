alter table public.store_purchase_quotes
  add column if not exists public_quote_key text;

update public.store_purchase_quotes
set public_quote_key = 'quote_' || encode(gen_random_bytes(16), 'hex')
where public_quote_key is null;

alter table public.store_purchase_quotes
  alter column public_quote_key set default ('quote_' || encode(gen_random_bytes(16), 'hex')),
  alter column public_quote_key set not null;

alter table public.store_purchase_quotes
  add constraint store_purchase_quotes_public_quote_key_format
    check (public_quote_key ~ '^quote_[a-f0-9]{32}$'),
  add constraint store_purchase_quotes_public_quote_key_unique
    unique (public_quote_key);

alter table public.store_purchases
  add column if not exists public_receipt_key text;

update public.store_purchases
set public_receipt_key = 'receipt_' || encode(gen_random_bytes(16), 'hex')
where public_receipt_key is null;

alter table public.store_purchases
  alter column public_receipt_key set default ('receipt_' || encode(gen_random_bytes(16), 'hex')),
  alter column public_receipt_key set not null;

alter table public.store_purchases
  add constraint store_purchases_public_receipt_key_format
    check (public_receipt_key ~ '^receipt_[a-f0-9]{32}$'),
  add constraint store_purchases_public_receipt_key_unique
    unique (public_receipt_key);

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
    select 1 from public.store_purchases p
    where p.game_session_id = p_game_session_id
      and p.player_id = p_player_id
      and p.idempotency_key = btrim(p_idempotency_key)
      and p.status = 'COMPLETED'
  ) into v_replay;

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

revoke all on function public.purchase_quoted_store_item_public_v1(uuid, uuid, text, text, timestamptz, jsonb) from public;
grant execute on function public.purchase_quoted_store_item_public_v1(uuid, uuid, text, text, timestamptz, jsonb) to service_role;
