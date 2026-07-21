begin;

create or replace function public.seed_content_request_is_privileged_v1()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or coalesce(
      nullif(current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb ->> 'role' = 'service_role'
    or current_user in ('postgres', 'supabase_admin')
    or session_user in ('postgres', 'supabase_admin');
$$;

comment on function public.seed_content_request_is_privileged_v1() is
  'Recognizes Supabase service_role credentials in both legacy request.jwt.claim.role and current request.jwt.claims formats. Callers still require explicit EXECUTE grants.';

revoke all on function public.seed_content_request_is_privileged_v1()
  from public, anon, authenticated;

commit;
