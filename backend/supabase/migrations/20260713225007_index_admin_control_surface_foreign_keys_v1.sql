begin;

create index if not exists attendance_day_locks_locked_by_staff_idx
  on public.attendance_day_locks (locked_by_staff_user_id);

create index if not exists audit_log_flags_flagged_by_staff_idx
  on public.audit_log_flags (flagged_by_staff_user_id);

create index if not exists contract_reward_issuances_cash_ledger_idx
  on public.contract_reward_issuances (cash_ledger_entry_id);

create index if not exists contract_reward_issuances_contract_idx
  on public.contract_reward_issuances (contract_id);

create index if not exists contract_reward_issuances_issued_by_staff_idx
  on public.contract_reward_issuances (issued_by_staff_user_id);

create index if not exists contract_reward_issuances_progress_idx
  on public.contract_reward_issuances (progress_id);

create index if not exists player_admin_flags_flagged_by_staff_idx
  on public.player_admin_flags (flagged_by_staff_user_id);

create index if not exists player_admin_settings_updated_by_staff_idx
  on public.player_admin_settings (updated_by_staff_user_id);

create index if not exists player_attendance_records_corrected_by_staff_idx
  on public.player_attendance_records (corrected_by_staff_user_id);

commit;
