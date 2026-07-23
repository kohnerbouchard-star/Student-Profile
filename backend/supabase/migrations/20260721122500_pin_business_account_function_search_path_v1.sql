-- Pin the immutable Business account-key helper to a deterministic search path.

begin;

create or replace function public.business_account_type_v1(
  p_business_public_key text
) returns text
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select 'business:' || lower(btrim(p_business_public_key));
$$;

revoke all on function public.business_account_type_v1(text)
from public, anon, authenticated;
grant execute on function public.business_account_type_v1(text)
to service_role;

comment on function public.business_account_type_v1(text) is
  'Builds the bounded internal Business ledger account key with an immutable, pinned search path.';

commit;
