begin;

drop policy if exists staff_users_select_own on public.staff_users;
create policy staff_users_select_own
on public.staff_users
for select
to authenticated
using (
  (select auth.uid()) is not null
  and supabase_auth_user_id = (select auth.uid())
);

drop policy if exists game_sessions_select_owned on public.game_sessions;
create policy game_sessions_select_owned
on public.game_sessions
for select
to authenticated
using (
  (select auth.uid()) is not null
  and owner_staff_user_id = public.current_staff_user_id()
);

drop index if exists public.kv_store_0dbf686f_key_idx1;
drop index if exists public.kv_store_0dbf686f_key_idx2;
drop index if exists public.kv_store_0dbf686f_key_idx3;
drop index if exists public.kv_store_0dbf686f_key_idx4;
drop index if exists public.kv_store_0dbf686f_key_idx5;
drop index if exists public.kv_store_0dbf686f_key_idx6;
drop index if exists public.kv_store_0dbf686f_key_idx7;
drop index if exists public.kv_store_0dbf686f_key_idx8;
drop index if exists public.kv_store_0dbf686f_key_idx9;
drop index if exists public.kv_store_0dbf686f_key_idx10;
drop index if exists public.kv_store_0dbf686f_key_idx11;
drop index if exists public.kv_store_0dbf686f_key_idx12;
drop index if exists public.kv_store_0dbf686f_key_idx13;
drop index if exists public.kv_store_0dbf686f_key_idx14;
drop index if exists public.kv_store_0dbf686f_key_idx15;
drop index if exists public.kv_store_0dbf686f_key_idx16;
drop index if exists public.kv_store_0dbf686f_key_idx17;
drop index if exists public.kv_store_0dbf686f_key_idx18;
drop index if exists public.kv_store_0dbf686f_key_idx19;
drop index if exists public.kv_store_0dbf686f_key_idx20;
drop index if exists public.kv_store_0dbf686f_key_idx21;

commit;
