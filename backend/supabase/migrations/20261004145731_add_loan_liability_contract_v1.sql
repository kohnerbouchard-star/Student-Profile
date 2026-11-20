-- REF025c1: additive identity only. Both creation gates remain installed until c5.
begin;

alter table public.loan_applications
  add column liability_kind text not null default 'legacy_v1',
  add column initiating_operator_player_id uuid,
  add column borrower_business_id uuid,
  add column obligation_currency_code text,
  add constraint loan_applications_liability_shape_v1 check (
    (liability_kind = 'legacy_v1' and initiating_operator_player_id is null
      and borrower_business_id is null and obligation_currency_code is null)
    or (liability_kind = 'business_v1' and initiating_operator_player_id is not null
      and borrower_business_id is not null and business_id is not null
      and initiating_operator_player_id = player_id and borrower_business_id = business_id
      and obligation_currency_code is not null and obligation_currency_code ~ '^[A-Z]{3,16}$')
  ),
  add constraint loan_applications_business_liability_disabled_v1
    check (liability_kind = 'legacy_v1'),
  add constraint loan_applications_operator_scope_fk_v1
    foreign key (game_session_id, initiating_operator_player_id)
    references public.players (game_session_id, id),
  add constraint loan_applications_borrower_scope_fk_v1
    foreign key (game_session_id, borrower_business_id)
    references public.business_entities (game_session_id, id);

create index loan_applications_operator_scope_idx_v1
  on public.loan_applications (game_session_id, initiating_operator_player_id);
create index loan_applications_borrower_scope_idx_v1
  on public.loan_applications (game_session_id, borrower_business_id);

alter table public.player_loans
  add column liability_kind text not null default 'legacy_v1',
  add column initiating_operator_player_id uuid,
  add column borrower_business_id uuid,
  add constraint player_loans_liability_shape_v1 check (
    (liability_kind = 'legacy_v1' and initiating_operator_player_id is null
      and borrower_business_id is null)
    or (liability_kind = 'business_v1' and initiating_operator_player_id is not null
      and borrower_business_id is not null and business_id is not null
      and initiating_operator_player_id = player_id and borrower_business_id = business_id)
  ),
  add constraint player_loans_business_liability_disabled_v1
    check (liability_kind = 'legacy_v1'),
  add constraint player_loans_operator_scope_fk_v1
    foreign key (game_session_id, initiating_operator_player_id)
    references public.players (game_session_id, id),
  add constraint player_loans_borrower_scope_fk_v1
    foreign key (game_session_id, borrower_business_id)
    references public.business_entities (game_session_id, id);

create index player_loans_operator_scope_idx_v1
  on public.player_loans (game_session_id, initiating_operator_player_id);
create index player_loans_borrower_scope_idx_v1
  on public.player_loans (game_session_id, borrower_business_id);

-- No grants, RLS, account bindings, economic RPCs or existing obligations change.
commit;
