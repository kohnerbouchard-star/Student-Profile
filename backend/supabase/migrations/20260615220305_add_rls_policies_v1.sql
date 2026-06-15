-- Eco Novaria RLS policies V1.
-- Security posture:
-- - RLS is defense-in-depth, not a replacement for backend access-boundary checks.
-- - Supabase service-role clients bypass RLS by design; backend authorization must remain strict.
-- - Direct player RLS is intentionally delayed because custom player sessions are not Supabase Auth identities.
-- - Credential, session, ledger, balance projection, and audit tables remain backend-only in V1.

create or replace function public.current_staff_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select staff_users.id
  from public.staff_users
  where auth.uid() is not null
    and staff_users.supabase_auth_user_id = auth.uid()
  limit 1
$$;

comment on function public.current_staff_user_id() is
  'Returns the V1 teacher staff_users.id for the current Supabase Auth user, or null when no authenticated staff row exists.';

create or replace function public.is_game_owner(target_game_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.game_sessions
    where game_sessions.id = target_game_session_id
      and game_sessions.owner_staff_user_id = public.current_staff_user_id()
  )
$$;

comment on function public.is_game_owner(uuid) is
  'Returns true only when the current Supabase Auth user maps to the teacher who owns the target game session.';

revoke all on function public.current_staff_user_id() from public;
revoke all on function public.is_game_owner(uuid) from public;
grant execute on function public.current_staff_user_id() to authenticated;
grant execute on function public.is_game_owner(uuid) to authenticated;

alter table public.staff_users enable row level security;
alter table public.purchase_codes enable row level security;
alter table public.game_sessions enable row level security;
alter table public.entitlements enable row level security;
alter table public.game_settings enable row level security;
alter table public.players enable row level security;
alter table public.player_access_credentials enable row level security;
alter table public.player_sessions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.account_balances enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists staff_users_select_own on public.staff_users;
create policy staff_users_select_own
on public.staff_users
for select
to authenticated
using (
  auth.uid() is not null
  and supabase_auth_user_id = auth.uid()
);

drop policy if exists game_sessions_select_owned on public.game_sessions;
create policy game_sessions_select_owned
on public.game_sessions
for select
to authenticated
using (
  auth.uid() is not null
  and owner_staff_user_id = public.current_staff_user_id()
);

-- No authenticated direct policies are added for the following tables in V1:
-- purchase_codes, entitlements, game_settings, players,
-- player_access_credentials, player_sessions, ledger_entries,
-- account_balances, and audit_log.
-- With RLS enabled and no table policies, normal anon/authenticated clients are denied.
-- Trusted backend/service-role code remains responsible for writes and sensitive reads.
