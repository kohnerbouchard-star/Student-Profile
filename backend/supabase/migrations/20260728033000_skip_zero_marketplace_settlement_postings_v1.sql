begin;

-- Marketplace policy permits zero fee and tax rates, while immutable financial
-- postings intentionally reject zero-value rows. Recompile only the private
-- settlement projection so mandatory buyer/seller postings remain present and
-- optional fee/tax postings are emitted only when their amount is positive.
do $migration$
declare
  v_oid oid;
  v_definition text;
  v_patched text;
  v_before constant text := $before$
  insert into public.marketplace_financial_postings (
    game_session_id, order_id, posting_group, posting_type, player_id, amount, currency_code
  ) values
    (p_game_session_id, v_order.id, 'settlement', 'buyer_debit', p_buyer_player_id,
      -v_reservation.buyer_total, v_reservation.currency_code),
    (p_game_session_id, v_order.id, 'settlement', 'seller_credit', v_reservation.seller_player_id,
      v_reservation.seller_proceeds, v_reservation.currency_code),
    (p_game_session_id, v_order.id, 'settlement', 'fee_credit', null,
      v_reservation.fee_amount, v_reservation.currency_code),
    (p_game_session_id, v_order.id, 'settlement', 'tax_credit', null,
      v_reservation.tax_amount, v_reservation.currency_code);
$before$;
  v_after constant text := $after$
  insert into public.marketplace_financial_postings (
    game_session_id, order_id, posting_group, posting_type, player_id, amount, currency_code
  ) values
    (p_game_session_id, v_order.id, 'settlement', 'buyer_debit', p_buyer_player_id,
      -v_reservation.buyer_total, v_reservation.currency_code),
    (p_game_session_id, v_order.id, 'settlement', 'seller_credit', v_reservation.seller_player_id,
      v_reservation.seller_proceeds, v_reservation.currency_code);

  insert into public.marketplace_financial_postings (
    game_session_id, order_id, posting_group, posting_type, player_id, amount, currency_code
  )
  select
    p_game_session_id,
    v_order.id,
    'settlement',
    optional_posting.posting_type,
    null,
    optional_posting.posting_amount,
    v_reservation.currency_code
  from (
    values
      ('fee_credit'::text, v_reservation.fee_amount),
      ('tax_credit'::text, v_reservation.tax_amount)
  ) as optional_posting(posting_type, posting_amount)
  where optional_posting.posting_amount > 0;
$after$;
begin
  select p.oid
  into strict v_oid
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'settle_marketplace_purchase_projection_legacy_v1';

  v_definition := pg_get_functiondef(v_oid);
  if position(v_before in v_definition) = 0 then
    raise exception 'MARKETPLACE_SETTLEMENT_POSTING_BLOCK_UNRECOGNIZED';
  end if;

  v_patched := replace(v_definition, v_before, v_after);
  if v_patched = v_definition then
    raise exception 'MARKETPLACE_SETTLEMENT_POSTING_PATCH_NOT_APPLIED';
  end if;

  execute v_patched;

  v_definition := pg_get_functiondef(v_oid);
  if position('where optional_posting.posting_amount > 0' in v_definition) = 0
    or position(v_before in v_definition) > 0
  then
    raise exception 'MARKETPLACE_SETTLEMENT_POSTING_PATCH_INVALID';
  end if;
end
$migration$;

revoke all on function public.settle_marketplace_purchase_projection_legacy_v1(uuid, uuid, text)
from public, anon, authenticated, service_role;

commit;
