-- Econovaria Business V2 Phase 10A.4C2: funded Marketplace posting compatibility.
--
-- C2 deliberately distinguishes funded commercial evidence from the retained
-- legacy settlement/refund posting groups. The original Marketplace table still
-- admitted only legacy vocabulary, and its nonzero invariant rejected the
-- optional zero tax/fee rows emitted by the first C2 functions. This forward
-- migration expands only the immutable evidence vocabulary and recompiles the
-- two C2 functions so optional postings are emitted only when nonzero.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

alter table public.marketplace_financial_postings
  drop constraint if exists marketplace_postings_group_valid;

alter table public.marketplace_financial_postings
  add constraint marketplace_postings_group_valid
  check (
    posting_group in (
      'settlement',
      'refund',
      'funded_settlement',
      'funded_refund'
    )
  ) not valid;

alter table public.marketplace_financial_postings
  validate constraint marketplace_postings_group_valid;

alter table public.marketplace_financial_postings
  drop constraint if exists marketplace_postings_type_valid;

alter table public.marketplace_financial_postings
  add constraint marketplace_postings_type_valid
  check (
    posting_type in (
      'buyer_debit',
      'seller_credit',
      'fee_credit',
      'tax_credit',
      'buyer_refund_credit',
      'seller_refund_debit',
      'fee_refund_debit',
      'tax_refund_debit',
      'buyer_commercial_debit',
      'buyer_commercial_credit',
      'seller_debit',
      'fee_debit',
      'tax_debit'
    )
  ) not valid;

alter table public.marketplace_financial_postings
  validate constraint marketplace_postings_type_valid;

-- Preserve mandatory Buyer/Seller commercial evidence while omitting optional
-- zero-value fee/tax evidence, matching the table's immutable nonzero contract.
do $migration$
declare
  v_definition text;
  v_patched text;
  v_before constant text := $before$
  insert into public.marketplace_financial_postings(
    game_session_id,
    order_id,
    posting_group,
    posting_type,
    player_id,
    amount,
    currency_code
  ) values
    (
      p_game_session_id,
      v_order.id,
      'funded_settlement',
      'buyer_commercial_debit',
      p_buyer_player_id,
      -v_reservation.buyer_total,
      v_reservation.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_settlement',
      'seller_credit',
      v_reservation.seller_player_id,
      v_reservation.seller_proceeds,
      v_reservation.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_settlement',
      'fee_credit',
      null,
      v_reservation.fee_amount,
      v_reservation.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_settlement',
      'tax_credit',
      null,
      v_reservation.tax_amount,
      v_reservation.currency_code
    );
$before$;
  v_after constant text := $after$
  insert into public.marketplace_financial_postings(
    game_session_id,
    order_id,
    posting_group,
    posting_type,
    player_id,
    amount,
    currency_code
  ) values
    (
      p_game_session_id,
      v_order.id,
      'funded_settlement',
      'buyer_commercial_debit',
      p_buyer_player_id,
      -v_reservation.buyer_total,
      v_reservation.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_settlement',
      'seller_credit',
      v_reservation.seller_player_id,
      v_reservation.seller_proceeds,
      v_reservation.currency_code
    );

  insert into public.marketplace_financial_postings(
    game_session_id,
    order_id,
    posting_group,
    posting_type,
    player_id,
    amount,
    currency_code
  )
  select
    p_game_session_id,
    v_order.id,
    'funded_settlement',
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
  select pg_get_functiondef(
    'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)'::regprocedure
  )
  into strict v_definition;

  if position(v_before in v_definition) = 0 then
    raise exception 'MARKETPLACE_FUNDED_SETTLEMENT_POSTING_BLOCK_UNRECOGNIZED'
      using errcode = 'P0001';
  end if;

  v_patched := replace(v_definition, v_before, v_after);
  if v_patched = v_definition then
    raise exception 'MARKETPLACE_FUNDED_SETTLEMENT_POSTING_PATCH_NOT_APPLIED'
      using errcode = 'P0001';
  end if;

  execute v_patched;

  select pg_get_functiondef(
    'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)'::regprocedure
  )
  into strict v_definition;

  if position('where optional_posting.posting_amount > 0' in v_definition) = 0
     or position(v_before in v_definition) > 0
  then
    raise exception 'MARKETPLACE_FUNDED_SETTLEMENT_POSTING_PATCH_INVALID'
      using errcode = 'P0001';
  end if;
end
$migration$;

-- Funded refunds retain mandatory Buyer/Seller evidence and emit optional
-- fee/tax debits only when the original order actually carried those amounts.
do $migration$
declare
  v_definition text;
  v_patched text;
  v_before constant text := $before$
  insert into public.marketplace_financial_postings(
    game_session_id,
    order_id,
    posting_group,
    posting_type,
    player_id,
    amount,
    currency_code
  ) values
    (
      p_game_session_id,
      v_order.id,
      'funded_refund',
      'buyer_commercial_credit',
      v_order.buyer_player_id,
      v_order.buyer_total,
      v_order.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_refund',
      'seller_debit',
      v_order.seller_player_id,
      -v_order.seller_proceeds,
      v_order.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_refund',
      'fee_debit',
      null,
      -v_order.fee_amount,
      v_order.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_refund',
      'tax_debit',
      null,
      -v_order.tax_amount,
      v_order.currency_code
    );
$before$;
  v_after constant text := $after$
  insert into public.marketplace_financial_postings(
    game_session_id,
    order_id,
    posting_group,
    posting_type,
    player_id,
    amount,
    currency_code
  ) values
    (
      p_game_session_id,
      v_order.id,
      'funded_refund',
      'buyer_commercial_credit',
      v_order.buyer_player_id,
      v_order.buyer_total,
      v_order.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_refund',
      'seller_debit',
      v_order.seller_player_id,
      -v_order.seller_proceeds,
      v_order.currency_code
    );

  insert into public.marketplace_financial_postings(
    game_session_id,
    order_id,
    posting_group,
    posting_type,
    player_id,
    amount,
    currency_code
  )
  select
    p_game_session_id,
    v_order.id,
    'funded_refund',
    optional_posting.posting_type,
    null,
    optional_posting.posting_amount,
    v_order.currency_code
  from (
    values
      ('fee_debit'::text, -v_order.fee_amount),
      ('tax_debit'::text, -v_order.tax_amount)
  ) as optional_posting(posting_type, posting_amount)
  where optional_posting.posting_amount < 0;
$after$;
begin
  select pg_get_functiondef(
    'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)'::regprocedure
  )
  into strict v_definition;

  if position(v_before in v_definition) = 0 then
    raise exception 'MARKETPLACE_FUNDED_REFUND_POSTING_BLOCK_UNRECOGNIZED'
      using errcode = 'P0001';
  end if;

  v_patched := replace(v_definition, v_before, v_after);
  if v_patched = v_definition then
    raise exception 'MARKETPLACE_FUNDED_REFUND_POSTING_PATCH_NOT_APPLIED'
      using errcode = 'P0001';
  end if;

  execute v_patched;

  select pg_get_functiondef(
    'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)'::regprocedure
  )
  into strict v_definition;

  if position('where optional_posting.posting_amount < 0' in v_definition) = 0
     or position(v_before in v_definition) > 0
  then
    raise exception 'MARKETPLACE_FUNDED_REFUND_POSTING_PATCH_INVALID'
      using errcode = 'P0001';
  end if;
end
$migration$;

-- Fail the migration if either vocabulary or the zero-row repair is incomplete.
do $assertions$
declare
  v_group_definition text;
  v_type_definition text;
  v_amount_definition text;
  v_settlement_definition text;
  v_refund_definition text;
begin
  select pg_get_constraintdef(constraint_row.oid)
  into strict v_group_definition
  from pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.marketplace_financial_postings'::regclass
    and constraint_row.conname = 'marketplace_postings_group_valid';

  select pg_get_constraintdef(constraint_row.oid)
  into strict v_type_definition
  from pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.marketplace_financial_postings'::regclass
    and constraint_row.conname = 'marketplace_postings_type_valid';

  select pg_get_constraintdef(constraint_row.oid)
  into strict v_amount_definition
  from pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.marketplace_financial_postings'::regclass
    and constraint_row.conname = 'marketplace_postings_amount_nonzero';

  if position('funded_settlement' in v_group_definition) = 0
     or position('funded_refund' in v_group_definition) = 0
  then
    raise exception 'MARKETPLACE_FUNDED_POSTING_GROUP_CONSTRAINT_INVALID'
      using errcode = 'P0001';
  end if;

  if position('buyer_commercial_debit' in v_type_definition) = 0
     or position('buyer_commercial_credit' in v_type_definition) = 0
     or position('seller_debit' in v_type_definition) = 0
     or position('fee_debit' in v_type_definition) = 0
     or position('tax_debit' in v_type_definition) = 0
  then
    raise exception 'MARKETPLACE_FUNDED_POSTING_TYPE_CONSTRAINT_INVALID'
      using errcode = 'P0001';
  end if;

  if position('amount <>' in v_amount_definition) = 0 then
    raise exception 'MARKETPLACE_POSTING_NONZERO_CONSTRAINT_MISSING'
      using errcode = 'P0001';
  end if;

  select pg_get_functiondef(
    'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)'::regprocedure
  )
  into strict v_settlement_definition;

  select pg_get_functiondef(
    'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)'::regprocedure
  )
  into strict v_refund_definition;

  if position('where optional_posting.posting_amount > 0' in v_settlement_definition) = 0
     or position('where optional_posting.posting_amount < 0' in v_refund_definition) = 0
  then
    raise exception 'MARKETPLACE_FUNDED_OPTIONAL_POSTING_FILTER_MISSING'
      using errcode = 'P0001';
  end if;
end
$assertions$;

comment on constraint marketplace_postings_group_valid
  on public.marketplace_financial_postings is
  'Retains legacy posting groups and admits explicit C2 funded settlement/refund evidence.';

comment on constraint marketplace_postings_type_valid
  on public.marketplace_financial_postings is
  'Retains legacy posting types and admits explicit C2 funded commercial debit/credit evidence.';

commit;
