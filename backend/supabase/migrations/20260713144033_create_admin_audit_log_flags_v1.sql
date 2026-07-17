begin;

create table if not exists public.audit_log_flags (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  audit_log_id uuid not null references public.audit_log(id) on delete cascade,
  flagged_by_staff_user_id uuid not null references public.staff_users(id) on delete cascade,
  reason text null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint audit_log_flags_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint audit_log_flags_reason_not_blank
    check (reason is null or length(btrim(reason)) > 0),
  constraint audit_log_flags_scope_unique
    unique (game_session_id, audit_log_id, flagged_by_staff_user_id)
);

create index if not exists audit_log_flags_game_status_created_idx
  on public.audit_log_flags (game_session_id, status, created_at desc);

create index if not exists audit_log_flags_audit_log_idx
  on public.audit_log_flags (audit_log_id);

alter table public.audit_log_flags enable row level security;

comment on table public.audit_log_flags is
  'Staff review state for immutable administrator audit-log events. Access is mediated by authorized server routes.';

commit;
