begin;

create or replace function public.review_marketplace_admin_strict_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_target_key text,
  p_action text,
  p_reason text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (
  outcome text,
  target_key text,
  target_type text,
  status text,
  version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target text := lower(btrim(coalesce(p_target_key, '')));
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_dispute public.marketplace_disputes%rowtype;
begin
  if v_target ~ '^dsp_[0-9a-f]{32}$' then
    select * into v_dispute
    from public.marketplace_disputes
    where game_session_id = p_game_session_id
      and public_id = v_target
    for update;

    if not found then
      raise exception 'MARKETPLACE_DISPUTE_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_dispute.version <> p_expected_version then
      raise exception 'MARKETPLACE_STALE_VERSION' using errcode = 'P0001';
    end if;
    if v_dispute.status <> 'open' then
      if (
        (v_dispute.status = 'resolved_buyer' and v_action = 'refund_buyer')
        or (v_dispute.status = 'resolved_seller' and v_action = 'resolve_seller')
        or (v_dispute.status = 'rejected' and v_action = 'reject')
      ) then
        return query select
          'replayed'::text,
          v_dispute.public_id,
          'dispute'::text,
          v_dispute.status,
          v_dispute.version,
          v_dispute.updated_at;
        return;
      end if;
      raise exception 'MARKETPLACE_TERMINAL_RESOLUTION_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  return query
  select *
  from public.review_marketplace_admin_v2(
    p_game_session_id,
    p_staff_user_id,
    p_target_key,
    p_action,
    p_reason,
    p_expected_version,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.review_marketplace_admin_strict_v1(
  uuid, uuid, text, text, text, bigint, text
) from public, anon, authenticated;

grant execute on function public.review_marketplace_admin_strict_v1(
  uuid, uuid, text, text, text, bigint, text
) to service_role;

commit;
