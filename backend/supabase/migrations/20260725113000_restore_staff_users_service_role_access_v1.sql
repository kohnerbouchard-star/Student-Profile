begin;

-- Staff signup and bootstrap run through service-owned Edge Functions. PostgREST
-- still requires explicit table privileges even though service_role bypasses RLS.
-- Browser roles remain unable to read or mutate administrator identities.
revoke all on table public.staff_users from public, anon, authenticated;
grant select, insert, update, delete on table public.staff_users to service_role;

comment on table public.staff_users is
  'Administrator identity projection. Browser roles have no direct access; service-owned authentication routes receive explicit persistence privileges.';

commit;
