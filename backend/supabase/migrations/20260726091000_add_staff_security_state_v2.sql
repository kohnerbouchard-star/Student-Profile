begin;

alter table public.staff_users
  add column if not exists status text not null default 'active',
  add column if not exists role text not null default 'game_admin',
  add column if not exists permission_version integer not null default 1,
  add column if not exists security_version bigint not null default 1,
  add column if not exists mfa_required boolean not null default true,
  add column if not exists security_hold_reason text null,
  add column if not exists suspended_at timestamptz null,
  add column if not exists compromised_at timestamptz null;

alter table public.staff_users
  drop constraint if exists staff_users_status_check,
  add constraint staff_users_status_check check (
    status in ('active', 'suspended', 'disabled', 'compromised')
  ),
  drop constraint if exists staff_users_role_check,
  add constraint staff_users_role_check check (
    role in ('game_admin', 'security_operator')
  ),
  drop constraint if exists staff_users_permission_version_check,
  add constraint staff_users_permission_version_check check (
    permission_version between 1 and 2147483647
  ),
  drop constraint if exists staff_users_security_version_check,
  add constraint staff_users_security_version_check check (
    security_version between 1 and 9223372036854775807
  ),
  drop constraint if exists staff_users_security_hold_reason_check,
  add constraint staff_users_security_hold_reason_check check (
    security_hold_reason is null
    or length(btrim(security_hold_reason)) between 1 and 500
  ),
  drop constraint if exists staff_users_security_state_check,
  add constraint staff_users_security_state_check check (
    (status = 'active' and suspended_at is null and compromised_at is null)
    or (status = 'suspended' and suspended_at is not null)
    or (status = 'disabled')
    or (status = 'compromised' and compromised_at is not null)
  );

create index if not exists staff_users_status_role_idx
  on public.staff_users (status, role);

comment on column public.staff_users.status is
  'Server-controlled staff account state. Only active accounts may receive application authorization.';
comment on column public.staff_users.role is
  'Server-controlled Econovaria role. Browser-supplied role claims are never trusted.';
comment on column public.staff_users.permission_version is
  'Version of the permission contract used to invalidate stale authorization assumptions.';
comment on column public.staff_users.security_version is
  'Monotonic security generation used to revoke or invalidate sessions after a security event.';
comment on column public.staff_users.mfa_required is
  'Whether the staff account must reach AAL2 before privileged operations.';

commit;
